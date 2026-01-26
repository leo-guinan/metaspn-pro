# OAuth Redirect to Localhost - Fix Guide

## Problem

OAuth redirects in production are going to `localhost` instead of your production domain (e.g., `https://pro.metaspn.network`). This happens when the `FRONTEND_URL` environment variable is not set correctly.

## Root Cause

The backend uses `FRONTEND_URL` to construct OAuth callback redirects. If this is:
- Not set → defaults to `http://localhost:3000`
- Set to localhost → redirects go to localhost
- Empty → defaults to `http://localhost:3000`

## Solution

### Step 1: Check Current Configuration

Run the diagnostic script on your production server:

```bash
bash /opt/metaspn/scripts/check-frontend-url.sh
```

This will show you:
- What `FRONTEND_URL` is set to in your `.env` file
- What the backend container is actually seeing
- Any errors or warnings

### Step 2: Fix the .env File

Edit your production `.env` file (usually at `/opt/metaspn/.env` or `/etc/metaspn/.env.prod`):

```bash
# On the server, edit the .env file
sudo nano /opt/metaspn/.env
# OR
sudo nano /etc/metaspn/.env.prod
```

**Set FRONTEND_URL to your production domain:**

```env
FRONTEND_URL=https://pro.metaspn.network
```

**Important:**
- Must use `https://` (not `http://`)
- Must be your actual production domain
- No trailing slash
- Must NOT be `localhost` or `127.0.0.1`

### Step 3: Restart Backend Container

After fixing the `.env` file, restart the backend to pick up the new value:

```bash
cd /opt/metaspn
docker compose -f docker-compose.prod.yml --env-file /opt/metaspn/.env restart backend
```

Or if using `/etc/metaspn/.env.prod`:

```bash
cd /opt/metaspn
docker compose -f docker-compose.prod.yml --env-file /etc/metaspn/.env.prod restart backend
```

### Step 4: Verify the Fix

1. **Check backend logs** to see the new FRONTEND_URL:

```bash
docker compose -f docker-compose.prod.yml logs backend | grep "FRONTEND_URL\|OAuth Config"
```

You should see:
```
[OAuth Config] FRONTEND_URL: https://pro.metaspn.network
[OAuth Config] GitHub Callback: https://pro.metaspn.network/api/auth/github/callback
[OAuth Config] Twitter Callback: https://pro.metaspn.network/api/auth/twitter/callback
```

2. **Test OAuth login** - try logging in with GitHub or Twitter and verify the redirect goes to your production domain, not localhost.

3. **Run the diagnostic script again**:

```bash
bash /opt/metaspn/scripts/check-frontend-url.sh
```

It should now show ✅ for all checks.

## Prevention

The deployment workflow now automatically checks `FRONTEND_URL` before deploying. If it's set to localhost or missing, the deployment will fail with a clear error message.

The backend also now:
- Logs `FRONTEND_URL` at startup (visible in logs)
- Fails fast if `FRONTEND_URL` is localhost in production (prevents silent failures)
- Shows clear error messages if misconfigured

## Related Environment Variables

Make sure these are also set correctly:

```env
# Frontend origin (for OAuth redirects)
FRONTEND_URL=https://pro.metaspn.network

# Frontend API URL (for API calls from frontend)
NEXT_PUBLIC_API_URL=https://pro.metaspn.network

# NextAuth URL (should match FRONTEND_URL)
NEXTAUTH_URL=https://pro.metaspn.network

# OAuth callback URLs (optional - default to ${FRONTEND_URL}/api/auth/.../callback)
# GITHUB_CALLBACK_URL=https://pro.metaspn.network/api/auth/github/callback
# TWITTER_CALLBACK_URL=https://pro.metaspn.network/api/auth/twitter/callback
```

## Troubleshooting

### Backend won't start after setting FRONTEND_URL

If the backend fails to start with an error about `FRONTEND_URL`, check:
1. The value is correct (no typos)
2. The value doesn't have quotes around it in the `.env` file
3. The value doesn't have a trailing slash

### Still redirecting to localhost after fix

1. **Verify the .env file is being used:**
   ```bash
   docker compose -f docker-compose.prod.yml --env-file /opt/metaspn/.env config | grep FRONTEND_URL
   ```

2. **Check what the container sees:**
   ```bash
   docker compose -f docker-compose.prod.yml exec backend sh -c 'echo "FRONTEND_URL=$FRONTEND_URL"'
   ```

3. **Check backend logs for the actual value:**
   ```bash
   docker compose -f docker-compose.prod.yml logs backend | grep "FRONTEND_URL"
   ```

4. **Force recreate the container** (not just restart):
   ```bash
   docker compose -f docker-compose.prod.yml --env-file /opt/metaspn/.env up -d --force-recreate backend
   ```

### Deployment fails with FRONTEND_URL error

The deployment workflow now validates `FRONTEND_URL` before deploying. If it fails:
1. Fix the `.env` file on the server
2. Re-run the deployment

## Example .env File

Here's what your production `.env` file should look like (relevant sections):

```env
# OAuth & Redirects
FRONTEND_URL=https://pro.metaspn.network

# Frontend configuration
NEXT_PUBLIC_API_URL=https://pro.metaspn.network
NEXTAUTH_URL=https://pro.metaspn.network

# OAuth (callbacks default to ${FRONTEND_URL}/api/auth/.../callback)
TWITTER_CLIENT_ID=your_twitter_client_id
TWITTER_CLIENT_SECRET=your_twitter_client_secret
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
```

## Need Help?

If you're still experiencing issues:
1. Run the diagnostic script: `bash /opt/metaspn/scripts/check-frontend-url.sh`
2. Check backend logs: `docker compose -f docker-compose.prod.yml logs backend --tail=100`
3. Verify the .env file location and permissions
4. Make sure you're using the correct docker-compose file (`docker-compose.prod.yml`)
