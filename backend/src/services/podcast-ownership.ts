import { pool } from '../db/index.js'
import { randomBytes } from 'crypto'

export interface PodcastOwnership {
  ownership_id: string
  user_id: string
  podcast_id: string
  verification_status: 'pending' | 'verified' | 'failed'
  verification_method: 'meta_tag'
  verification_token: string
  verified_at: Date | null
  created_at: Date
  updated_at: Date
}

/**
 * Generate a unique verification token for meta tag verification
 */
export function generateVerificationToken(): string {
  return randomBytes(32).toString('hex')
}

/**
 * Check if podcast already has verified ownership by another user
 */
export async function checkExistingVerifiedOwnership(
  podcast_id: string
): Promise<{ hasVerifiedOwner: boolean; owner_user_id?: string }> {
  const result = await pool.query(
    `SELECT user_id 
     FROM podcast_ownership 
     WHERE podcast_id = $1 AND verification_status = 'verified'
     LIMIT 1`,
    [podcast_id]
  )

  if (result.rows.length > 0) {
    return {
      hasVerifiedOwner: true,
      owner_user_id: result.rows[0].user_id,
    }
  }

  return { hasVerifiedOwner: false }
}

/**
 * Validate domain consistency between RSS feed URL and website URL
 * Ensures both are from the same domain for security
 */
export function validateDomainConsistency(
  rss_feed_url: string,
  website_url: string | null
): { valid: boolean; message?: string } {
  if (!website_url) {
    return {
      valid: false,
      message: 'Website URL is required for ownership verification',
    }
  }

  try {
    const rssUrl = new URL(rss_feed_url)
    const websiteUrl = new URL(website_url)

    // Extract hostnames and remove www. prefix
    const rssDomain = rssUrl.hostname.replace(/^www\./, '').toLowerCase()
    const websiteDomain = websiteUrl.hostname.replace(/^www\./, '').toLowerCase()

    // Get root domain (last 2 parts: example.com)
    const getRootDomain = (domain: string) => {
      const parts = domain.split('.')
      if (parts.length >= 2) {
        return parts.slice(-2).join('.')
      }
      return domain
    }

    const rssRoot = getRootDomain(rssDomain)
    const websiteRoot = getRootDomain(websiteDomain)

    // Allow if:
    // 1. Root domains match exactly
    // 2. RSS domain is subdomain of website domain (e.g., feed.example.com and example.com)
    // 3. Website domain is subdomain of RSS domain
    if (
      rssRoot === websiteRoot ||
      rssDomain.endsWith('.' + websiteRoot) ||
      websiteDomain.endsWith('.' + rssRoot)
    ) {
      return { valid: true }
    }

    return {
      valid: false,
      message: `RSS feed domain (${rssDomain}) does not match website domain (${websiteDomain}). Both must be from the same domain for security verification.`,
    }
  } catch (error: any) {
    return {
      valid: false,
      message: `Invalid URL format: ${error.message || 'Unknown error'}`,
    }
  }
}

/**
 * Verify ownership via meta tag check
 * Fetches the podcast website and checks for the verification meta tag
 */
export async function verifyOwnershipViaMetaTag(
  podcast_id: string,
  verification_token: string
): Promise<{ verified: boolean; message: string }> {
  try {
    // Get podcast website URL
    const podcastResult = await pool.query(
      'SELECT website_url FROM podcasts WHERE podcast_id = $1',
      [podcast_id]
    )

    if (podcastResult.rows.length === 0) {
      return { verified: false, message: 'Podcast not found' }
    }

    const website_url = podcastResult.rows[0].website_url

    if (!website_url) {
      return {
        verified: false,
        message: 'Podcast does not have a website URL. Please add one to verify ownership.',
      }
    }

    // Validate URL
    let url: URL
    try {
      url = new URL(website_url)
    } catch {
      return { verified: false, message: 'Invalid website URL format' }
    }

    // Fetch the website HTML
    let html: string
    try {
      const response = await fetch(url.toString(), {
        headers: {
          'User-Agent': 'MetaSPN-Verification/1.0',
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      })

      if (!response.ok) {
        return {
          verified: false,
          message: `Failed to fetch website: ${response.status} ${response.statusText}`,
        }
      }

      html = await response.text()
    } catch (error: any) {
      return {
        verified: false,
        message: `Failed to fetch website: ${error.message || 'Network error'}`,
      }
    }

    // Check for meta tag
    const metaTagPattern = new RegExp(
      `<meta\\s+name=["']metaspn-verification["']\\s+content=["']${verification_token}["']`,
      'i'
    )

    const verified = metaTagPattern.test(html)

    if (verified) {
      // Update ownership record
      await pool.query(
        `UPDATE podcast_ownership 
         SET verification_status = 'verified', 
             verified_at = NOW()
         WHERE podcast_id = $1 AND verification_token = $2`,
        [podcast_id, verification_token]
      )
    } else {
      // Update to failed status
      await pool.query(
        `UPDATE podcast_ownership 
         SET verification_status = 'failed'
         WHERE podcast_id = $1 AND verification_token = $2`,
        [podcast_id, verification_token]
      )
    }

    return {
      verified,
      message: verified
        ? 'Ownership verified successfully!'
        : 'Meta tag not found. Please ensure the meta tag is correctly added to your website.',
    }
  } catch (error: any) {
    console.error('Error verifying ownership:', error)
    return {
      verified: false,
      message: `Verification error: ${error.message || 'Unknown error'}`,
    }
  }
}

/**
 * Claim podcast ownership for a user
 * Creates an ownership record with pending verification status
 */
export async function claimPodcastOwnership(
  user_id: string,
  podcast_id: string
): Promise<{
  ownership_id: string
  verification_token: string
  verification_instructions: string
}> {
  // Check if ownership already exists for this user
  const existing = await pool.query(
    'SELECT ownership_id, verification_token FROM podcast_ownership WHERE user_id = $1 AND podcast_id = $2',
    [user_id, podcast_id]
  )

  if (existing.rows.length > 0) {
    const ownership = existing.rows[0]
    return {
      ownership_id: ownership.ownership_id,
      verification_token: ownership.verification_token,
      verification_instructions: getVerificationInstructions(ownership.verification_token),
    }
  }

  // Check if podcast already has verified ownership by another user
  const verifiedCheck = await checkExistingVerifiedOwnership(podcast_id)
  if (verifiedCheck.hasVerifiedOwner && verifiedCheck.owner_user_id !== user_id) {
    throw new Error(
      'This podcast is already verified by another owner. Please contact support if you believe this is an error.'
    )
  }

  // Generate verification token
  const verification_token = generateVerificationToken()

  // Create ownership record
  const result = await pool.query(
    `INSERT INTO podcast_ownership (user_id, podcast_id, verification_token, verification_status)
     VALUES ($1, $2, $3, 'pending')
     RETURNING ownership_id`,
    [user_id, podcast_id, verification_token]
  )

  return {
    ownership_id: result.rows[0].ownership_id,
    verification_token,
    verification_instructions: getVerificationInstructions(verification_token),
  }
}

/**
 * Get all podcasts owned by a user
 */
export async function getOwnedPodcasts(
  user_id: string
): Promise<
  Array<{
    ownership_id: string
    podcast_id: string
    title: string
    description: string | null
    image_url: string | null
    website_url: string | null
    verification_status: string
    verification_token: string
    verified_at: Date | null
    created_at: Date
  }>
> {
  const result = await pool.query(
    `SELECT 
      po.ownership_id,
      po.podcast_id,
      p.title,
      p.description,
      p.image_url,
      p.website_url,
      po.verification_status,
      po.verification_token,
      po.verified_at,
      po.created_at
    FROM podcast_ownership po
    JOIN podcasts p ON po.podcast_id = p.podcast_id
    WHERE po.user_id = $1
    ORDER BY po.created_at DESC`,
    [user_id]
  )

  return result.rows
}

/**
 * Check if user owns a podcast (and it's verified)
 */
export async function checkOwnership(
  user_id: string,
  podcast_id: string
): Promise<{ owns: boolean; verified: boolean }> {
  const result = await pool.query(
    `SELECT verification_status 
     FROM podcast_ownership 
     WHERE user_id = $1 AND podcast_id = $2`,
    [user_id, podcast_id]
  )

  if (result.rows.length === 0) {
    return { owns: false, verified: false }
  }

  const verified = result.rows[0].verification_status === 'verified'

  return { owns: true, verified }
}

/**
 * Get verification instructions for meta tag
 */
function getVerificationInstructions(token: string): string {
  return `Add the following meta tag to the <head> section of your website:

<meta name="metaspn-verification" content="${token}">

After adding the tag, click "Verify Ownership" to complete verification.`
}
