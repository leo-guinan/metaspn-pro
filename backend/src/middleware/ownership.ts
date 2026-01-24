import { Context, Next } from 'hono'
import { checkOwnership } from '../services/podcast-ownership.js'

/**
 * Middleware to verify that the authenticated user owns (and has verified) a podcast
 * Must be used after requireAuth middleware
 */
export async function requirePodcastOwnership(c: Context, next: Next) {
  const user_id = c.get('user_id')
  const podcast_id = c.req.param('podcast_id')

  if (!podcast_id) {
    return c.json({ error: 'Podcast ID is required' }, 400)
  }

  const { owns, verified } = await checkOwnership(user_id, podcast_id)

  if (!owns) {
    return c.json(
      {
        error: 'You do not own this podcast. Please claim ownership first.',
      },
      403
    )
  }

  if (!verified) {
    return c.json(
      {
        error: 'Podcast ownership is not verified. Please verify ownership to access host features.',
      },
      403
    )
  }

  await next()
}
