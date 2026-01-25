import { ChromaClient, CloudClient } from 'chromadb'

// Initialize Chroma client
// Use CloudClient if tenant and database are provided (Chroma Cloud)
// Otherwise use regular ChromaClient (local or self-hosted)
let chromaClient: ChromaClient | CloudClient

if (process.env.CHROMA_TENANT && process.env.CHROMA_DATABASE) {
  // Chroma Cloud configuration
  if (!process.env.CHROMA_API_KEY) {
    throw new Error('CHROMA_API_KEY is required when using Chroma Cloud (CHROMA_TENANT and CHROMA_DATABASE are set)')
  }
  
  chromaClient = new CloudClient({
    apiKey: process.env.CHROMA_API_KEY,
    tenant: process.env.CHROMA_TENANT,
    database: process.env.CHROMA_DATABASE,
  })
  console.log(`✅ Using Chroma CloudClient (tenant: ${process.env.CHROMA_TENANT}, database: ${process.env.CHROMA_DATABASE})`)
} else {
  // Local or self-hosted Chroma
  chromaClient = new ChromaClient({
    path: process.env.CHROMA_API_URL || 'http://localhost:8000',
    auth: process.env.CHROMA_API_KEY ? {
      provider: 'token',
      credentials: process.env.CHROMA_API_KEY,
    } : undefined,
  })
  console.log('✅ Using local/self-hosted Chroma client')
}

// Collection names
export const transcriptChunksCollection = 'metaspn_transcript_chunks'
export const expressionsCollection = 'metaspn_expressions'

/**
 * Get or create a Chroma collection
 */
export async function getChromaCollection(name: string) {
  try {
    return await chromaClient.getOrCreateCollection({
      name,
      metadata: { 
        description: `MetaSPN ${name} embeddings`,
        created_at: new Date().toISOString(),
      },
    })
  } catch (error) {
    console.error(`Error getting Chroma collection ${name}:`, error)
    throw error
  }
}

/**
 * Get transcript chunks collection
 */
export async function getTranscriptChunksCollection() {
  return getChromaCollection(transcriptChunksCollection)
}

/**
 * Get expressions collection
 */
export async function getExpressionsCollection() {
  return getChromaCollection(expressionsCollection)
}

export { chromaClient }
