import { ChromaClient } from 'chromadb'

// Initialize Chroma client
const chromaClient = new ChromaClient({
  path: process.env.CHROMA_API_URL || 'https://api.trychroma.com',
  auth: {
    provider: 'token',
    credentials: process.env.CHROMA_API_KEY || '',
  },
})

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
