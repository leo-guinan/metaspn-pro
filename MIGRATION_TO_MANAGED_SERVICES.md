# Migration to Managed Services (Neon + Chroma Cloud)

This document outlines the migration from self-hosted PostgreSQL with pgvector to Neon.tech (PostgreSQL) and Chroma Cloud (vector database).

## Architecture Changes

### Before (Self-Hosted)
```
Server (2GB RAM):
├── PostgreSQL + pgvector (~1GB RAM)
├── Backend API
├── Frontend
└── Worker
```

### After (Managed Services)
```
Server (2GB RAM):
├── Backend API (~256MB)
├── Frontend (~256MB)
└── Worker (~128MB)
Total: ~640MB used, 1.36GB headroom ✅

External:
├── Neon.tech (PostgreSQL) - Managed
└── Chroma Cloud (Vector DB) - Managed
```

## Benefits

1. **RAM Savings**: ~1GB freed up (PostgreSQL + pgvector removed)
2. **Managed Backups**: Neon handles automated backups
3. **Auto-scaling**: Both services scale automatically
4. **Better Performance**: Chroma optimized for vector operations
5. **Simpler Operations**: No database maintenance on server

## Migration Steps

### 1. Database Schema Changes

**Remove from `database/schema.sql`:**

```sql
-- REMOVE THIS:
CREATE EXTENSION IF NOT EXISTS vector;

-- REMOVE embedding columns:
-- From transcript_chunks:
embedding vector(1536), -- REMOVE

-- From expressions:
embedding vector(1536), -- REMOVE

-- REMOVE vector indexes:
CREATE INDEX idx_transcript_chunks_embedding ON transcript_chunks USING ivfflat (embedding vector_cosine_ops); -- REMOVE
CREATE INDEX idx_expressions_embedding ON expressions USING ivfflat (embedding vector_cosine_ops); -- REMOVE
```

**Updated schema:**

```sql
-- Transcript chunks (no embedding column)
CREATE TABLE transcript_chunks (
  chunk_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  episode_id UUID NOT NULL REFERENCES episodes(episode_id) ON DELETE CASCADE,
  start_sec DECIMAL NOT NULL,
  end_sec DECIMAL NOT NULL,
  text TEXT NOT NULL,
  -- embedding removed - stored in Chroma instead
  chroma_id TEXT, -- Reference to Chroma collection item
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Expressions (no embedding column)
CREATE TABLE expressions (
  expression_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  timestamp_utc TIMESTAMPTZ NOT NULL,
  text TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('manual', 'twitter', 'bluesky', 'github')),
  -- embedding removed - stored in Chroma instead
  chroma_id TEXT, -- Reference to Chroma collection item
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 2. Code Changes Required

#### A. Install Chroma Client

```bash
cd backend
pnpm add chromadb
```

#### B. Create Chroma Service

Create `backend/src/services/chroma.ts`:

```typescript
import { ChromaClient } from 'chromadb'

const chromaClient = new ChromaClient({
  path: process.env.CHROMA_API_URL || 'https://api.trychroma.com',
  auth: {
    provider: 'token',
    credentials: process.env.CHROMA_API_KEY!,
  },
})

// Collections
export const transcriptChunksCollection = 'transcript_chunks'
export const expressionsCollection = 'expressions'

export async function getChromaCollection(name: string) {
  try {
    return await chromaClient.getOrCreateCollection({
      name,
      metadata: { description: `MetaSPN ${name} embeddings` },
    })
  } catch (error) {
    console.error(`Error getting Chroma collection ${name}:`, error)
    throw error
  }
}

export { chromaClient }
```

#### C. Update Transcript Tools

**Update `backend/src/mastra/tools/transcript-tools.ts`:**

```typescript
// OLD: Store in PostgreSQL with pgvector
// NEW: Store text in PostgreSQL, embeddings in Chroma

export const storeTranscriptChunks = createTool({
  id: 'store_transcript_chunks',
  description: 'Store transcript chunks: text in PostgreSQL, embeddings in Chroma.',
  inputSchema: z.object({
    episode_id: z.string().uuid(),
    chunks_with_embeddings: z.array(
      z.object({
        start_sec: z.number(),
        end_sec: z.number(),
        text: z.string(),
        embedding: z.array(z.number()),
      })
    ),
  }),
  execute: async ({ context }: any) => {
    const { episode_id, chunks_with_embeddings } = context
    const collection = await getChromaCollection(transcriptChunksCollection)

    // Delete existing chunks for this episode
    await pool.query('DELETE FROM transcript_chunks WHERE episode_id = $1', [episode_id])
    
    // Delete from Chroma (by episode_id metadata)
    await collection.delete({ where: { episode_id } })

    // Prepare data for Chroma
    const ids: string[] = []
    const embeddings: number[][] = []
    const metadatas: any[] = []
    const texts: string[] = []

    // Prepare data for PostgreSQL
    const dbInserts: any[] = []

    for (const chunk of chunks_with_embeddings) {
      const chunkId = uuidv4()
      ids.push(chunkId)
      embeddings.push(chunk.embedding)
      texts.push(chunk.text)
      metadatas.push({
        episode_id,
        start_sec: chunk.start_sec,
        end_sec: chunk.end_sec,
      })

      dbInserts.push({
        chunk_id: chunkId,
        episode_id,
        start_sec: chunk.start_sec,
        end_sec: chunk.end_sec,
        text: chunk.text,
        chroma_id: chunkId,
      })
    }

    // Insert into Chroma
    await collection.add({
      ids,
      embeddings,
      metadatas,
      documents: texts,
    })

    // Insert into PostgreSQL (text only, no embeddings)
    for (const insert of dbInserts) {
      await pool.query(
        `INSERT INTO transcript_chunks (chunk_id, episode_id, start_sec, end_sec, text, chroma_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [insert.chunk_id, insert.episode_id, insert.start_sec, insert.end_sec, insert.text, insert.chroma_id]
      )
    }

    return {
      stored_count: chunks_with_embeddings.length,
      success: true,
    }
  },
})
```

#### D. Update Influence Linking Tools

**Update `backend/src/mastra/tools/influence-linking-tools.ts`:**

```typescript
// OLD: Query PostgreSQL with vector similarity
// NEW: Query Chroma for similarity, join with PostgreSQL for metadata

export const findSimilarChunks = createTool({
  id: 'find_similar_chunks',
  description: 'Find similar transcript chunks using Chroma vector search.',
  inputSchema: z.object({
    expression_embedding: z.array(z.number()),
    episode_ids: z.array(z.string().uuid()).optional(),
    limit: z.number().default(10),
    threshold: z.number().default(0.3),
  }),
  execute: async ({ context }: any) => {
    const { expression_embedding, episode_ids, limit, threshold } = context
    const collection = await getChromaCollection(transcriptChunksCollection)

    // Build where clause for Chroma
    const where: any = {}
    if (episode_ids && episode_ids.length > 0) {
      where.episode_id = { $in: episode_ids }
    }

    // Query Chroma for similar chunks
    const results = await collection.query({
      queryEmbeddings: [expression_embedding],
      nResults: limit,
      where,
    })

    // Get chunk IDs from Chroma results
    const chromaIds = results.ids[0] || []
    const similarities = results.distances?.[0]?.map((d: number) => 1 - d) || [] // Convert distance to similarity

    // Fetch full chunk data from PostgreSQL
    if (chromaIds.length === 0) {
      return { matches: [] }
    }

    const placeholders = chromaIds.map((_: string, i: number) => `$${i + 1}`).join(',')
    const dbResult = await pool.query(
      `SELECT chunk_id, episode_id, start_sec, end_sec, text
       FROM transcript_chunks
       WHERE chroma_id IN (${placeholders})`,
      chromaIds
    )

    // Combine Chroma results with PostgreSQL data
    const matches = dbResult.rows
      .map((row, idx) => ({
        chunk_id: row.chunk_id,
        episode_id: row.episode_id,
        start_sec: parseFloat(row.start_sec),
        end_sec: parseFloat(row.end_sec),
        text: row.text,
        similarity: similarities[idx] || 0,
      }))
      .filter((m) => m.similarity >= threshold)

    return { matches }
  },
})
```

#### E. Update Expression Import Tools

**Update `backend/src/mastra/tools/expression-import-tools.ts`:**

```typescript
// Store embedding in Chroma, reference in PostgreSQL

export const createExpression = createTool({
  // ... existing code ...
  execute: async ({ context }: any) => {
    // Generate embedding (same as before)
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    })
    const embedding = embeddingResponse.data[0].embedding

    // Store in Chroma
    const collection = await getChromaCollection(expressionsCollection)
    const expressionId = uuidv4()
    
    await collection.add({
      ids: [expressionId],
      embeddings: [embedding],
      documents: [text],
      metadatas: [{
        user_id,
        timestamp_utc: timestamp_utc.toISOString(),
        source,
      }],
    })

    // Store in PostgreSQL (text only, reference to Chroma)
    await pool.query(
      `INSERT INTO expressions (expression_id, user_id, timestamp_utc, text, source, chroma_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [expressionId, user_id, timestamp_utc, text, source, expressionId, JSON.stringify(metadata)]
    )

    return { expression_id: expressionId }
  },
})
```

### 3. Infrastructure Changes

#### A. Update docker-compose.prod.yml

**Remove PostgreSQL service entirely:**

```yaml
# REMOVE THIS ENTIRE SERVICE:
# postgres:
#   image: pgvector/pgvector:pg16
#   ...

# REMOVE db-backup service too
```

**Update resource limits (now that PostgreSQL is gone):**

```yaml
backend:
  deploy:
    resources:
      limits:
        cpus: '1'      # Reduced from 2
        memory: 256M   # Reduced from 2G
      reservations:
        cpus: '0.25'   # Reduced from 0.5
        memory: 128M   # Reduced from 512M

frontend:
  deploy:
    resources:
      limits:
        cpus: '1'      # Reduced from 2
        memory: 256M   # Reduced from 2G
      reservations:
        cpus: '0.25'   # Reduced from 0.5
        memory: 128M   # Reduced from 512M

worker:
  deploy:
    resources:
      limits:
        cpus: '0.5'    # Reduced from 1
        memory: 128M   # Reduced from 1G
      reservations:
        cpus: '0.1'
        memory: 64M    # Reduced from 256M
```

#### B. Update Environment Variables

**Add to `.env.prod.example`:**

```bash
# Neon.tech PostgreSQL (managed)
DATABASE_URL=postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require

# Chroma Cloud
CHROMA_API_URL=https://api.trychroma.com
CHROMA_API_KEY=your_chroma_api_key_here
```

**Remove:**
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DB`
- `BACKUP_RETENTION_DAYS`
- `BACKUP_STORAGE_PATH`

#### C. Remove Database Backup Scripts

These are no longer needed (Neon handles backups):
- `scripts/backup-database.sh` (can keep for reference)
- `scripts/restore-database.sh` (can keep for reference)
- `scripts/backup-all.sh` (update to exclude database)

#### D. Update Migration Scripts

**Update `scripts/run-migrations.sh`:**

```bash
# Change connection to use Neon DATABASE_URL
# Remove any pgvector-specific migration steps
```

### 4. Package Changes

**Remove from `backend/package.json`:**

```json
// REMOVE:
"pgvector": "^0.1.8",
```

**Add to `backend/package.json`:**

```json
// ADD:
"chromadb": "^1.8.0",
```

## Migration Checklist

### Pre-Migration

- [ ] Set up Neon.tech account and create database
- [ ] Set up Chroma Cloud account and get API key
- [ ] Test Neon connection from local machine
- [ ] Test Chroma API from local machine

### Code Migration

- [ ] Update database schema (remove pgvector)
- [ ] Install Chroma client package
- [ ] Create Chroma service wrapper
- [ ] Update transcript tools
- [ ] Update expression import tools
- [ ] Update influence linking tools
- [ ] Remove pgvector from package.json
- [ ] Update all vector-related queries

### Infrastructure Migration

- [ ] Remove PostgreSQL from docker-compose.prod.yml
- [ ] Remove db-backup service
- [ ] Update resource limits
- [ ] Update environment variables
- [ ] Update .env.prod.example
- [ ] Update deployment scripts
- [ ] Update documentation

### Data Migration

- [ ] Export existing embeddings from PostgreSQL
- [ ] Import embeddings into Chroma Cloud
- [ ] Update PostgreSQL records with chroma_id references
- [ ] Verify data integrity

### Testing

- [ ] Test transcript chunk storage
- [ ] Test expression creation
- [ ] Test similarity search
- [ ] Test influence linking workflow
- [ ] Load test with production-like data

## Rollback Plan

If migration fails:

1. Keep old docker-compose.yml with PostgreSQL
2. Keep pgvector code in a feature branch
3. Can switch back by:
   - Reverting code changes
   - Restarting PostgreSQL container
   - Restoring from backup

## Cost Considerations

### Neon.tech
- Free tier: 0.5GB storage, shared CPU
- Paid: ~$19/month for 10GB, dedicated CPU
- Auto-scaling, managed backups included

### Chroma Cloud
- Check current pricing (varies by usage)
- Typically pay-per-query or subscription model

### Total
- Likely $20-50/month for both services
- But saves you from needing 4-8GB RAM server ($8-19/month)
- Net: Similar cost, better performance, less operational overhead

## Next Steps

1. Review this migration plan
2. Set up Neon.tech and Chroma Cloud accounts
3. Create feature branch: `feature/migrate-to-managed-services`
4. Implement changes incrementally
5. Test thoroughly before production deployment
