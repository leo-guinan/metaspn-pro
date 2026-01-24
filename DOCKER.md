# Docker Development Setup

This project uses Docker Compose to run the full development stack locally.

## Prerequisites

- Docker Desktop (or Docker Engine + Docker Compose)
- Environment variables set (see `.env.example`)

## Quick Start

1. **Create a `.env` file** from `.env.example`:
   ```bash
   cp .env.example .env
   ```

2. **Update `.env` with your API keys**:
   - `OPENAI_API_KEY` - Required for embeddings
   - `ANTHROPIC_API_KEY` - Required for agents
   - `NEXTAUTH_SECRET` - Generate a random string (used for token encryption)
   - `JWT_SECRET` - Generate a random string for JWT tokens (or use NEXTAUTH_SECRET)
   - `TWITTER_CLIENT_ID` and `TWITTER_CLIENT_SECRET` - For Twitter OAuth (see OAuth Setup below)
   - `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` - For GitHub OAuth (see OAuth Setup below)

3. **Start all services**:
   ```bash
   docker-compose up
   ```

4. **Access the services**:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001
   - Mastra Studio: http://localhost:4111
   - Postgres: localhost:5432

## Services

### Postgres
- **Image**: `pgvector/pgvector:pg16` (includes pgvector extension)
- **Port**: 5432
- **Database**: `metaspn`
- **User**: `metaspn`
- **Password**: `metaspn_dev_password` (change in production!)
- **Schema**: Automatically initialized from `database/schema.sql`

### Backend
- **Port**: 3001
- **Hot Reload**: Enabled (code changes trigger restart)
- **Health Check**: Available at http://localhost:3001/health

### Frontend
- **Port**: 3000
- **Hot Reload**: Enabled (Next.js fast refresh)
- **API URL**: Configured to point to backend at http://localhost:3001

### Mastra Dev
- **Port**: 4111
- **Purpose**: Mastra Studio UI and REST API endpoints
- **Access**: http://localhost:4111 (Studio UI) and http://localhost:4111/swagger-ui (REST API)
- **Command**: `mastra dev`
- **Hot Reload**: Enabled (code changes trigger restart)

### Worker
- **Port**: None (internal only)
- **Purpose**: Background processes for scheduled workflows and data enhancement
- **Scheduled Tasks**:
  - Transcript Discovery: Daily at 2 AM UTC
  - Influence Linking: Hourly
  - Daily Report: Midnight UTC
  - Monthly Digest: 1st of month at 1 AM UTC
  - Enhancement Watcher: Every 15 minutes (checks for podcasts/episodes needing enhancement)
- **Command**: `pnpm run worker`

## Development Commands

### Start services
```bash
docker-compose up
```

### Start in detached mode (background)
```bash
docker-compose up -d
```

### View logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f mastra-dev
docker-compose logs -f worker
docker-compose logs -f postgres
```

### Stop services
```bash
docker-compose down
```

### Stop and remove volumes (clean slate)
```bash
docker-compose down -v
```

### Rebuild after dependency changes
```bash
docker-compose build --no-cache
docker-compose up
```

### Run database migrations
```bash
docker-compose exec backend pnpm run db:migrate
```

### Run database migrations
```bash
# GitHub integrations migration
docker compose exec -T postgres psql -U metaspn -d metaspn -f - < database/migrations/add_user_github_repos.sql

# OAuth accounts migration
docker compose exec -T postgres psql -U metaspn -d metaspn -f - < database/migrations/add_user_oauth_accounts.sql
```

### Access Postgres shell
```bash
docker-compose exec postgres psql -U metaspn -d metaspn
```

### Access backend shell
```bash
docker-compose exec backend sh
```

### Access frontend shell
```bash
docker-compose exec frontend sh
```

### Access worker shell
```bash
docker-compose exec worker sh
```

### View worker logs
```bash
docker-compose logs -f worker
```

### View Mastra dev logs
```bash
docker-compose logs -f mastra-dev
```

## Environment Variables

The following environment variables are used:

### Backend
- `DATABASE_URL` - Auto-configured to use postgres service
- `OPENAI_API_KEY` - Required for embeddings
- `ANTHROPIC_API_KEY` - Required for agents
- `NODE_ENV` - Set to `development`
- **Authentication**:
  - `JWT_SECRET` - Secret for JWT token signing (fallback: `NEXTAUTH_SECRET`)
  - `JWT_EXPIRES_IN` - Token expiration (default: `7d`)
- **Twitter OAuth** (optional, for account verification):
  - `TWITTER_CLIENT_ID` - Twitter OAuth 2.0 App client ID
  - `TWITTER_CLIENT_SECRET` - Twitter OAuth 2.0 App client secret
  - `TWITTER_CALLBACK_URL` - OAuth callback (e.g. `http://localhost:3001/api/auth/twitter/callback`)
- **GitHub OAuth** (optional, for login and integrations):
  - `GITHUB_CLIENT_ID` - GitHub OAuth App client ID
  - `GITHUB_CLIENT_SECRET` - GitHub OAuth App client secret
  - `GITHUB_CALLBACK_URL` - OAuth callback (e.g. `http://localhost:3001/api/auth/github/callback`)
  - `GITHUB_TOKEN_ENCRYPTION_KEY` - Encrypt tokens at rest (fallback: `NEXTAUTH_SECRET`)
  - `GITHUB_PUSH_CRON` - Worker cron for scheduled push (default: `0 */6 * * *`, every 6h)
  - `FRONTEND_URL` - Frontend origin for OAuth redirect (e.g. `http://localhost:3000`)

### Frontend
- `NEXT_PUBLIC_API_URL` - Backend API URL (http://localhost:3001)
- `NEXTAUTH_URL` - Frontend URL (http://localhost:3000)
- `NEXTAUTH_SECRET` - Secret for NextAuth.js
- `NODE_ENV` - Set to `development`

### Postgres
- `POSTGRES_USER` - Database user (metaspn)
- `POSTGRES_PASSWORD` - Database password
- `POSTGRES_DB` - Database name (metaspn)

## Troubleshooting

### Port already in use
If ports 3000, 3001, 4111, or 5432 are already in use:
1. Stop the conflicting service
2. Or modify ports in `docker-compose.yml`:
   ```yaml
   ports:
     - "3002:3000"  # Change frontend port
     - "3003:3001"  # Change backend port
     - "4112:4111"  # Change Mastra dev port
     - "5433:5432"  # Change postgres port
   ```

### Database connection errors
1. Ensure postgres service is healthy: `docker-compose ps`
2. Check postgres logs: `docker-compose logs postgres`
3. Verify DATABASE_URL in backend environment

### Hot reload not working
1. Ensure volumes are mounted correctly
2. Check file permissions
3. For frontend, ensure `WATCHPACK_POLLING=true` is set

### Dependencies not installing
1. Rebuild without cache: `docker-compose build --no-cache`
2. Check pnpm version matches packageManager in package.json
3. Clear node_modules volumes: `docker-compose down -v`

## Production Considerations

⚠️ **This setup is for development only!**

For production:
1. Use proper secrets management (not .env files)
2. Change default passwords
3. Use production-grade Postgres configuration
4. Enable SSL/TLS for database connections
5. Use proper reverse proxy (nginx/traefik)
6. Set up proper logging and monitoring
7. Use multi-stage Docker builds for smaller images
8. Remove volume mounts (use COPY instead)

## Architecture

```
┌─────────────┐
│  Frontend   │ (Next.js on :3000)
│  :3000      │
└──────┬──────┘
       │ HTTP
       ▼
┌─────────────┐
│   Backend   │ (Hono HTTP API on :3001)
│   :3001     │
└──────┬──────┘
       │
       ├─────────────────┐
       │                 │
       ▼                 ▼
┌─────────────┐   ┌─────────────┐
│  mastra-dev │   │   Worker    │
│  :4111      │   │ (background)│
└──────┬──────┘   └──────┬──────┘
       │                 │
       └────────┬────────┘
                │ SQL
                ▼
         ┌─────────────┐
         │  Postgres   │ (pgvector on :5432)
         │  :5432      │
         └─────────────┘
```

All services communicate over the `metaspn-network` Docker network.

- **Frontend**: Next.js application serving the UI
- **Backend**: Hono HTTP server with Mastra integration for API endpoints
- **Mastra Dev**: Mastra Studio UI and REST API for development/testing
- **Worker**: Background process handling scheduled workflows and data enhancement tasks
- **Postgres**: Database with pgvector extension

### GitHub integrations (repo structure)

When you connect a GitHub repo, it is seeded with:

- `README.md` – Describes the repo and layout
- `log/events.jsonl` – Append-only listening event ledger (one JSON object per line)
- `reports/fan-summary.md` – Fan summary (Markdown)
- `reports/influence-digest.md` – Influence digest (Markdown)
- `preferences/podcasts.json` – Podcast preferences (JSON)
- `meta.json` – `schema_version`, `last_sync_utc`, `metaspn_user_id`

Data is pushed via **Push now** (Settings → Integrations) or the worker’s scheduled GitHub push job.
