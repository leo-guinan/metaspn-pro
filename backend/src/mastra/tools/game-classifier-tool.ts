import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

const BASE_URL =
  process.env.GAME_CLASSIFIER_URL ?? 'http://localhost:3002'
const REQUEST_TIMEOUT_MS = 15_000
const MAX_RETRIES = 2
const RETRY_DELAY_MS = 500

interface PredictResponse {
  primary_game: string
  secondary_game: string
  confidence: number
  confidence_tier: 'high' | 'medium' | 'low'
  probabilities: Record<string, number>
  geometry: { margin: number; drift: number; quality_score: number }
  quality_score: number
}

interface BatchResponse {
  predictions: PredictResponse[]
  stats: {
    total: number
    high_confidence: number
    medium_confidence: number
    low_confidence: number
    avg_confidence: number
  }
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 0
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })
    clearTimeout(timeoutId)
    if (!res.ok && retries < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
      return fetchWithRetry(url, options, retries + 1)
    }
    return res
  } catch (e) {
    clearTimeout(timeoutId)
    if (retries < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
      return fetchWithRetry(url, options, retries + 1)
    }
    throw e
  }
}

/**
 * Single prediction: classify text into a founder game (G1–G6).
 */
export const classifyGameTool = createTool({
  id: 'classify-founder-game',
  description: `Classify text into a founder game category (G1–G6) using the hybrid game classification API (FounderClassifier + ManifoldClassifier). Use for single texts like episode descriptions, tweets, or notes.`,
  inputSchema: z.object({
    text: z.string().describe('Text to classify (e.g. episode description, tweet, note)'),
    episode_id: z.string().optional().describe('Optional episode ID for context'),
    episode_number: z.number().optional().describe('Optional episode number for context'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    primary_game: z.string().optional(),
    secondary_game: z.string().optional(),
    confidence: z.number().optional(),
    confidence_tier: z.enum(['high', 'medium', 'low']).optional(),
    probabilities: z.record(z.number()).optional(),
    geometry: z
      .object({
        margin: z.number(),
        drift: z.number(),
        quality_score: z.number(),
      })
      .optional(),
    quality_score: z.number().optional(),
    error: z.string().optional(),
  }),
  execute: async ({ text, episode_id, episode_number }) => {
    try {
      const res = await fetchWithRetry(
        `${BASE_URL}/predict`,
        {
          method: 'POST',
          body: JSON.stringify({
            text,
            ...(episode_id != null && { episode_id }),
            ...(episode_number != null && { episode_number }),
          }),
        }
      )
      if (!res.ok) {
        const err = await res.text()
        return {
          success: false,
          error: `Game classifier API error ${res.status}: ${err || res.statusText}`,
        }
      }
      const data = (await res.json()) as PredictResponse
      return {
        success: true,
        primary_game: data.primary_game,
        secondary_game: data.secondary_game,
        confidence: data.confidence,
        confidence_tier: data.confidence_tier,
        probabilities: data.probabilities,
        geometry: data.geometry,
        quality_score: data.quality_score,
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return {
        success: false,
        error: `Game classifier request failed: ${message}`,
      }
    }
  },
})

/**
 * Batch prediction: classify multiple texts in one request.
 */
export const classifyGamesBatchTool = createTool({
  id: 'classify-founder-games-batch',
  description: `Classify multiple texts into founder game categories (G1–G6) in one request. Use for batches of episode descriptions, tweets, or notes. More efficient than calling single classify repeatedly.`,
  inputSchema: z.object({
    texts: z.array(z.string()).min(1).max(100).describe('List of texts to classify'),
    episode_ids: z.array(z.string()).optional().describe('Optional episode IDs, same length as texts'),
    episode_numbers: z.array(z.number()).optional().describe('Optional episode numbers, same length as texts'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    predictions: z
      .array(
        z.object({
          primary_game: z.string(),
          secondary_game: z.string(),
          confidence: z.number(),
          confidence_tier: z.string(),
          quality_score: z.number(),
        })
      )
      .optional(),
    stats: z
      .object({
        total: z.number(),
        high_confidence: z.number(),
        medium_confidence: z.number(),
        low_confidence: z.number(),
        avg_confidence: z.number(),
      })
      .optional(),
    error: z.string().optional(),
  }),
  execute: async ({ texts, episode_ids, episode_numbers }) => {
    try {
      const body: Record<string, unknown> = { texts }
      if (episode_ids?.length) body.episode_ids = episode_ids
      if (episode_numbers?.length) body.episode_numbers = episode_numbers

      const res = await fetchWithRetry(`${BASE_URL}/predict/batch`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.text()
        return {
          success: false,
          error: `Game classifier batch API error ${res.status}: ${err || res.statusText}`,
        }
      }
      const data = (await res.json()) as BatchResponse
      return {
        success: true,
        predictions: data.predictions.map((p) => ({
          primary_game: p.primary_game,
          secondary_game: p.secondary_game,
          confidence: p.confidence,
          confidence_tier: p.confidence_tier,
          quality_score: p.quality_score,
        })),
        stats: data.stats,
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return {
        success: false,
        error: `Game classifier batch request failed: ${message}`,
      }
    }
  },
})
