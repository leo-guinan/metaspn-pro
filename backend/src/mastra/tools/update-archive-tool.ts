import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

// Supabase configuration
const SUPABASE_URL = 'https://fabxmporizzqflnftavs.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhYnhtcG9yaXp6cWZsbmZ0YXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjIyNDQ5MTIsImV4cCI6MjAzNzgyMDkxMn0.UIEJiUNkLsW28tBHmG-RQDW-I5JNlJLt62CSk9D_qG8';

// Rate limiting and retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const REQUEST_TIMEOUT_MS = 30000;
const PAGE_SIZE = 1000;

interface TweetData {
  id_str?: string;
  id?: number;
  created_at?: string;
  full_text?: string;
  [key: string]: unknown;
}

interface SupabaseTweet {
  tweet_id: string;
  account_id: string;
  created_at: string;
  full_text: string;
  favorite_count?: number;
  retweet_count?: number;
  reply_to_tweet_id?: string;
  reply_to_user_id?: string;
  reply_to_username?: string;
}

interface SupabaseAccount {
  account_id: string;
  username: string;
  account_display_name?: string;
}

interface Entities {
  hashtags: Array<{ text: string; indices: [number, number] }>;
  symbols: unknown[];
  user_mentions: Array<{
    screen_name: string;
    name: string;
    indices: [number, number];
  }>;
  urls: unknown[];
}

/**
 * Get account_id for a username from Supabase
 */
async function getAccountId(
  username: string,
  retryCount = 0
): Promise<string | null> {
  const url = `${SUPABASE_URL}/rest/v1/account?username=eq.${encodeURIComponent(username)}&select=account_id,username`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (retryCount < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        return getAccountId(username, retryCount + 1);
      }
      return null;
    }

    const data = (await response.json()) as SupabaseAccount[];
    return data.length > 0 ? data[0].account_id : null;
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      return getAccountId(username, retryCount + 1);
    }
    return null;
  }
}

/**
 * Parse Twitter date format: "Mon Jan 01 12:00:00 +0000 2024"
 * Twitter dates are always in UTC (+0000)
 */
function parseTwitterDate(dateStr: string): Date {
  // Twitter format: "Mon Jan 01 12:00:00 +0000 2024"
  // Example: "Mon Jan 01 12:00:00 +0000 2024"
  const parts = dateStr.trim().split(/\s+/);
  if (parts.length >= 6) {
    const monthMap: Record<string, string> = {
      Jan: '01',
      Feb: '02',
      Mar: '03',
      Apr: '04',
      May: '05',
      Jun: '06',
      Jul: '07',
      Aug: '08',
      Sep: '09',
      Oct: '10',
      Nov: '11',
      Dec: '12',
    };

    const month = monthMap[parts[1]] || '01';
    const day = parts[2].padStart(2, '0');
    const time = parts[3];
    const year = parts[5];

    // Create ISO format: "2024-01-01T12:00:00.000Z" (UTC)
    const isoStr = `${year}-${month}-${day}T${time}.000Z`;
    return new Date(isoStr);
  }

  // Fallback to direct parsing
  return new Date(dateStr);
}

/**
 * Format date to Twitter format: "Mon Jan 01 12:00:00 +0000 2024"
 * Twitter dates are always in UTC (+0000)
 */
function formatTwitterDate(date: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  const day = days[date.getUTCDay()];
  const month = months[date.getUTCMonth()];
  const dayNum = date.getUTCDate().toString().padStart(2, '0');
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
  const seconds = date.getUTCSeconds().toString().padStart(2, '0');
  const year = date.getUTCFullYear();

  // Twitter dates are always UTC (+0000)
  const timezone = '+0000';

  return `${day} ${month} ${dayNum} ${hours}:${minutes}:${seconds} ${timezone} ${year}`;
}

/**
 * Fetch new tweets from Supabase with pagination
 */
async function fetchNewTweets(
  accountId: string,
  sinceDate: Date,
  retryCount = 0
): Promise<SupabaseTweet[]> {
  // Use gte (greater than or equal) instead of gt to ensure we get all tweets from the sinceDate onward
  // This ensures we don't miss tweets from the same timestamp
  const sinceIso = sinceDate.toISOString();
  const allTweets: SupabaseTweet[] = [];
  let offset = 0;

  console.log(`[UpdateArchive] Fetching tweets from Supabase since ${sinceIso}...`);

  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/tweets?account_id=eq.${accountId}&created_at=gte.${sinceIso}&order=created_at.asc&limit=${PAGE_SIZE}&offset=${offset}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS
      );

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (retryCount < MAX_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
          return fetchNewTweets(accountId, sinceDate, retryCount + 1);
        }
        throw new Error(`HTTP error ${response.status}`);
      }

      const data = (await response.json()) as SupabaseTweet[];

      if (data.length === 0) {
        break;
      }

      allTweets.push(...data);
      console.log(`[UpdateArchive] Fetched ${data.length} tweets (total: ${allTweets.length}) from offset ${offset}`);
      
      // Log date range and tweet IDs of fetched tweets
      if (data.length > 0) {
        const firstDate = data[0].created_at;
        const lastDate = data[data.length - 1].created_at;
        const tweetIds = data.map(t => t.tweet_id).slice(0, 10); // Log first 10 IDs
        console.log(`[UpdateArchive] Date range: ${firstDate} to ${lastDate}`);
        console.log(`[UpdateArchive] Sample tweet IDs: ${tweetIds.join(', ')}${data.length > 10 ? '...' : ''}`);
      }

      // If we got fewer than page_size, we're done
      if (data.length < PAGE_SIZE) {
        break;
      }

      offset += PAGE_SIZE;
    } catch (error) {
      if (retryCount < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        return fetchNewTweets(accountId, sinceDate, retryCount + 1);
      }
      throw error;
    }
  }

  return allTweets;
}

/**
 * Extract entities (mentions, hashtags) from tweet text
 */
function extractEntitiesFromText(text: string): Entities {
  const entities: Entities = {
    hashtags: [],
    symbols: [],
    user_mentions: [],
    urls: [],
  };

  if (!text) {
    return entities;
  }

  const words = text.split(/\s+/);
  let currentIndex = 0;

  for (const word of words) {
    const wordStart = text.indexOf(word, currentIndex);
    const wordEnd = wordStart + word.length;
    currentIndex = wordEnd;

    // Extract mentions (@username)
    if (word.startsWith('@') && word.length > 1) {
      const mention = word.replace(/[.,;:!?()\[\]{}"'`]/g, '');
      if (mention.length > 1) {
        entities.user_mentions.push({
          screen_name: mention.substring(1).toLowerCase(),
          name: mention.substring(1),
          indices: [wordStart, wordEnd] as [number, number],
        });
      }
    }
    // Extract hashtags (#tag)
    else if (word.startsWith('#') && word.length > 1) {
      const hashtag = word.replace(/[.,;:!?()\[\]{}"'`]/g, '');
      if (hashtag.length > 1) {
        entities.hashtags.push({
          text: hashtag.substring(1),
          indices: [wordStart, wordEnd] as [number, number],
        });
      }
    }
  }

  return entities;
}

/**
 * Convert Supabase tweet to archive JSON format
 */
function convertTweetToArchiveFormat(
  tweet: SupabaseTweet
): { tweet: TweetData } | null {
  try {
    const tweetId = tweet.tweet_id;
    if (!tweetId) {
      return null;
    }

    const createdAt = tweet.created_at;
    if (!createdAt) {
      return null;
    }

    // Parse ISO format and convert to Twitter format
    const date = new Date(createdAt);
    const createdAtStr = formatTwitterDate(date);

    const fullText = tweet.full_text || '';

    // Extract entities from text
    const entities = extractEntitiesFromText(fullText);

    const tweetData: TweetData = {
      id_str: String(tweetId),
      id: /^\d+$/.test(String(tweetId))
        ? parseInt(String(tweetId), 10)
        : 0,
      full_text: fullText,
      created_at: createdAtStr,
      favorite_count: tweet.favorite_count || 0,
      retweet_count: tweet.retweet_count || 0,
      lang: 'en', // Default, not in tweets table
      source: '', // Not in tweets table
      possibly_sensitive: false,
      retweeted: false,
      favorited: false,
      truncated: false,
      in_reply_to_status_id_str: tweet.reply_to_tweet_id
        ? String(tweet.reply_to_tweet_id)
        : undefined,
      in_reply_to_status_id: tweet.reply_to_tweet_id &&
      /^\d+$/.test(String(tweet.reply_to_tweet_id))
        ? parseInt(String(tweet.reply_to_tweet_id), 10)
        : undefined,
      in_reply_to_user_id: tweet.reply_to_user_id &&
      /^\d+$/.test(String(tweet.reply_to_user_id))
        ? parseInt(String(tweet.reply_to_user_id), 10)
        : undefined,
      in_reply_to_user_id_str: tweet.reply_to_user_id
        ? String(tweet.reply_to_user_id)
        : undefined,
      in_reply_to_screen_name: tweet.reply_to_username,
      entities,
      display_text_range: [0, fullText.length],
    };

    return { tweet: tweetData };
  } catch (error) {
    console.error(`Error converting tweet ${tweet.tweet_id}:`, error);
    return null;
  }
}

/**
 * Update database with new tweets from Supabase
 */
async function updateArchive(
  username: string
): Promise<{
  success: boolean;
  username: string;
  newTweets: number;
  totalTweets: number;
  latestDateBefore: string | null;
  latestDateAfter: string | null;
  archive?: {
    tweets: Array<{ tweet: TweetData }>;
  };
  error?: string;
}> {
  // Get account_id
  const accountId = await getAccountId(username);
  if (!accountId) {
    return {
      success: false,
      username,
      newTweets: 0,
      totalTweets: 0,
      latestDateBefore: null,
      latestDateAfter: null,
      error: `Could not find account_id for username: ${username}`,
    };
  }

  // First, get the latest tweet date from the archive JSON
  // This ensures we only fetch tweets that are newer than what's in the archive
  let latestDate: Date;
  let latestDateBefore: string | null = null;

  try {
    // Import and execute the tool
    const twitterArchiveToolModule = await import('./twitter-archive-tool');
    const twitterArchiveTool = twitterArchiveToolModule.twitterArchiveTool;
    
    if (!twitterArchiveTool) {
      throw new Error('twitterArchiveTool not found');
    }
    
    // Execute the tool - tools created with createTool have execute method
    const archiveResult: any = await (twitterArchiveTool as any).execute({ username });
    
    // Check if result is a ValidationError
    if (archiveResult && 'success' in archiveResult && archiveResult.success && archiveResult.archive) {
      const archive = archiveResult.archive as { tweets?: Array<{ tweet: any }> };
      const tweets = archive.tweets || [];
      
      // Find the latest tweet date in the archive
      let latestArchiveDate: Date | null = null;
      for (const wrapper of tweets) {
        const t = wrapper.tweet;
        if (t.created_at) {
          const tweetDate = parseTwitterDate(t.created_at);
          if (!latestArchiveDate || tweetDate > latestArchiveDate) {
            latestArchiveDate = tweetDate;
          }
        }
      }

      if (latestArchiveDate) {
        latestDate = latestArchiveDate;
        latestDateBefore = latestDate.toISOString();
        console.log(`[UpdateArchive] Using latest archive date: ${latestDateBefore}`);
      } else {
        // No tweets in archive, fetch from a very old date
        latestDate = new Date('2000-01-01T00:00:00Z');
        console.log(`[UpdateArchive] No tweets in archive, fetching from 2000-01-01`);
      }
    } else {
      // Archive not found or error, use a very old date
      latestDate = new Date('2000-01-01T00:00:00Z');
      console.log(`[UpdateArchive] Archive not found or error, fetching from 2000-01-01`);
    }
  } catch (error) {
    console.warn(`[UpdateArchive] Error getting archive, using 2000-01-01:`, error);
    latestDate = new Date('2000-01-01T00:00:00Z');
  }


  // Fetch new tweets - ensure we're using a date that will catch all new tweets
  // Subtract 1 second to ensure we don't miss tweets from the exact same timestamp
  const queryDate = new Date(latestDate.getTime() - 1000);
  console.log(`[UpdateArchive] Querying Supabase for tweets since ${queryDate.toISOString()} (original latest: ${latestDate.toISOString()})`);
  
  let newTweetsData: SupabaseTweet[];
  try {
    newTweetsData = await fetchNewTweets(accountId, queryDate);
  } catch (error) {
    return {
      success: false,
      username,
      newTweets: 0,
      totalTweets: 0,
      latestDateBefore,
      latestDateAfter: null,
      error:
        error instanceof Error
          ? `Error fetching tweets: ${error.message}`
          : 'Unknown error fetching tweets',
    };
  }

  if (newTweetsData.length === 0) {
    return {
      success: true,
      username,
      newTweets: 0,
      totalTweets: 0,
      latestDateBefore,
      latestDateAfter: latestDateBefore,
    };
  }

  // Convert tweets to archive format for pass-through to GitHub
  const archiveTweets = newTweetsData
    .map(convertTweetToArchiveFormat)
    .filter((t): t is { tweet: TweetData } => t !== null);

  const latestDateAfter = newTweetsData.length > 0 
    ? newTweetsData[newTweetsData.length - 1].created_at 
    : latestDateBefore;

  return {
    success: true,
    username,
    newTweets: archiveTweets.length,
    totalTweets: archiveTweets.length,
    latestDateBefore,
    latestDateAfter: latestDateAfter || latestDateBefore,
    archive: {
      tweets: archiveTweets,
    },
  };
}

export const updateArchiveTool = createTool({
  id: 'update-twitter-archive',
  description:
    "Fetch new tweets from Supabase and convert them to archive format for pass-through to GitHub. Queries Supabase for tweets posted after the latest tweet in the existing archive.",
  inputSchema: z.object({
    username: z
      .string()
      .describe('Twitter username (without @) to update archive for'),
  }),
  outputSchema: z.object({
    success: z.boolean().describe('Whether the update was successful'),
    username: z.string().describe('The username that was updated'),
    newTweets: z
      .number()
      .describe('Number of new tweets found'),
    totalTweets: z
      .number()
      .describe('Total number of new tweets in the archive'),
    latestDateBefore: z
      .string()
      .nullable()
      .describe('ISO date of the latest tweet before update'),
    latestDateAfter: z
      .string()
      .nullable()
      .describe('ISO date of the latest tweet after update'),
    archive: z
      .object({
        tweets: z.array(z.object({ tweet: z.unknown() })),
      })
      .optional()
      .describe('Archive JSON with new tweets in Twitter archive format'),
    error: z.string().optional().describe('Error message if update failed'),
  }),
  execute: async (inputData) => {
    return await updateArchive(inputData.username);
  },
});
