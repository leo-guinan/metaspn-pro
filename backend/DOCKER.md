

## OAuth Setup

### Twitter OAuth 2.0 Setup

1. **Create a Twitter App**:
   - Go to [Twitter Developer Portal](https://developer.twitter.com/en/portal/dashboard)
   - Create a new app or use an existing one
   - Enable OAuth 2.0
   - Set **Callback URI** to: `http://localhost:3001/api/auth/twitter/callback` (for development)
   - Set **App permissions** to: Read (for `tweet.read`, `users.read`, `offline.access` scopes)

2. **Get Credentials**:
   - Copy **Client ID** and **Client Secret**
   - Add to `.env`:
     ```
     TWITTER_CLIENT_ID=your_client_id_here
     TWITTER_CLIENT_SECRET=your_client_secret_here
     TWITTER_CALLBACK_URL=http://localhost:3001/api/auth/twitter/callback
     ```

3. **Note**: Twitter OAuth 2.0 uses PKCE (Proof Key for Code Exchange) for security. The implementation handles this automatically.

### GitHub OAuth Setup

1. **Create a GitHub OAuth App**:
   - Go to [GitHub Developer Settings](https://github.com/settings/developers)
   - Click "New OAuth App"
   - Set **Application name**: MetaSPN Pro (or your choice)
   - Set **Homepage URL**: `http://localhost:3000` (for development)
   - Set **Authorization callback URL**: `http://localhost:3001/api/auth/github/callback`
   - Click "Register application"

2. **Get Credentials**:
   - Copy **Client ID** and generate a **Client Secret**
   - Add to `.env`:
     ```
     GITHUB_CLIENT_ID=your_client_id_here
     GITHUB_CLIENT_SECRET=your_client_secret_here
     GITHUB_CALLBACK_URL=http://localhost:3001/api/auth/github/callback
     ```

### Authentication Flow

1. **User Login**:
   - User visits `/auth/login`
   - Clicks "Sign in with Twitter" or "Sign in with GitHub"
   - Redirected to provider OAuth page
   - After authorization, redirected back to `/auth/callback` with JWT token
   - Token stored in `localStorage` as `metaspn_token`

2. **Account Linking**:
   - Logged-in users can link additional accounts from Settings → Integrations
   - Click "Link Twitter" or "Link GitHub"
   - Complete OAuth flow
   - Account is linked to existing user

3. **API Requests**:
   - Frontend automatically includes `Authorization: Bearer <token>` header
   - Backend validates token and sets `user_id` in request context
   - Protected endpoints use `requireAuth` middleware

### Database Migration

After setting up OAuth, run the migration to create the `user_oauth_accounts` table:

```bash
docker compose exec -T postgres psql -U metaspn -d metaspn -f - < database/migrations/add_user_oauth_accounts.sql
```
