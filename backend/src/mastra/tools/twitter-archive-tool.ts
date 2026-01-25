import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

// Supabase configuration
const SUPABASE_URL = 'https://fabxmporizzqflnftavs.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhYnhtcG9yaXp6cWZsbmZ0YXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjIyNDQ5MTIsImV4cCI6MjAzNzgyMDkxMn0.UIEJiUNkLsW28tBHmG-RQDW-I5JNlJLt62CSk9D_qG8';
const STORAGE_BASE_URL = `${SUPABASE_URL}/storage/v1/object/public/archives`;

// Rate limiting and retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000; // 2 seconds
const REQUEST_TIMEOUT_MS = 30000; // 30 seconds

interface ArchiveResponse {
  success: boolean;
  username: string;
  archive?: unknown; // The archive JSON data
  size?: number; // Size in bytes
  error?: string;
  statusCode?: number;
}

interface ArchiveData {
  tweets?: Array<{ tweet: unknown }>;
  [key: string]: unknown;
}

interface SupabaseAccount {
  account_id: string;
  username: string;
  account_display_name?: string;
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
 * Downloads a user's Twitter archive from Supabase storage with retry logic
 */
async function downloadUserArchive(
  username: string,
  retryCount = 0
): Promise<ArchiveResponse> {
  // Normalize username: remove @ if present, lowercase
  const normalizedUsername = username.replace(/^@/, '').toLowerCase();
  const url = `${STORAGE_BASE_URL}/${normalizedUsername}/archive.json`;
  
  console.log(`[TwitterArchiveTool] Checking archive at URL: ${url} for username: "${username}" (normalized: "${normalizedUsername}")`);

  try {
    // Create an AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      },
    });

    clearTimeout(timeoutId);

    // Handle rate limiting (429)
    if (response.status === 429) {
      const retryAfter = parseInt(
        response.headers.get('Retry-After') || String(RETRY_DELAY_MS / 1000)
      );

      if (retryCount < MAX_RETRIES) {
        await new Promise((resolve) =>
          setTimeout(resolve, retryAfter * 1000)
        );
        return downloadUserArchive(username, retryCount + 1);
      }

      return {
        success: false,
        username,
        error: 'Rate limited - max retries reached',
        statusCode: 429,
      };
    }

    // Handle 400/404 (archive not found)
    if (response.status === 400 || response.status === 404) {
      try {
        const errorData = (await response.json()) as {
          error?: string;
          statusCode?: string;
        };
        if (
          errorData.error === 'not_found' ||
          errorData.statusCode === '404'
        ) {
          return {
            success: false,
            username,
            error: 'Archive not found',
            statusCode: 404,
          };
        }
      } catch {
        // If JSON parsing fails, just return the status
      }

      return {
        success: false,
        username,
        error: `Bad request (${response.status})`,
        statusCode: response.status,
      };
    }

    // Raise for other HTTP errors
    if (!response.ok) {
      if (retryCount < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        return downloadUserArchive(username, retryCount + 1);
      }

      return {
        success: false,
        username,
        error: `HTTP error ${response.status}`,
        statusCode: response.status,
      };
    }

    // Get content size
    const contentLength = response.headers.get('content-length');
    const size = contentLength ? parseInt(contentLength, 10) : undefined;

    // Parse JSON
    const archive = (await response.json()) as ArchiveData;

    return {
      success: true,
      username,
      archive,
      size,
    };
  } catch (error) {
    // Handle network errors, timeouts, etc.
    if (retryCount < MAX_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      return downloadUserArchive(username, retryCount + 1);
    }

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return {
          success: false,
          username,
          error: 'Request timeout',
        };
      }

      return {
        success: false,
        username,
        error: `Network error: ${error.message}`,
      };
    }

    return {
      success: false,
      username,
      error: 'Unknown error occurred',
    };
  }
}

export const twitterArchiveTool = createTool({
  id: 'download-twitter-archive',
  description:
    "Download a user's Twitter archive from the community archive stored in Supabase. Returns the archive JSON data.",
  inputSchema: z.object({
    username: z
      .string()
      .describe('Twitter username (without @) to download archive for'),
  }),
  outputSchema: z.object({
    success: z.boolean().describe('Whether the download was successful'),
    username: z.string().describe('The username that was requested'),
    archive: z
      .unknown()
      .optional()
      .describe('The archive JSON data if successful'),
    size: z
      .number()
      .optional()
      .describe('Size of the archive in bytes'),
    error: z
      .string()
      .optional()
      .describe('Error message if download failed'),
    statusCode: z
      .number()
      .optional()
      .describe('HTTP status code if request failed'),
  }),
  execute: async (inputData) => {
    return await downloadUserArchive(inputData.username);
  },
});
