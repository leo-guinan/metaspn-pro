# MetaSPN Pro

A web-first intelligence layer for podcast listening that transforms raw listening behavior into a cooperative game between listeners, podcasters, and guests.

## Architecture

- **Frontend**: Next.js 14+ (App Router) with React, TypeScript, Tailwind CSS
- **Backend**: Mastra framework for agent-native architecture
- **Database**: Neon.tech (PostgreSQL) + Chroma Cloud (Vector DB)
- **Infrastructure**: Hetzner (production server), Neon.tech (database), Chroma Cloud (vectors)

## Getting Started

### Option 1: Docker Compose (Recommended for Development)

The easiest way to get started is using Docker Compose:

```bash
# Quick start
./docker-start.sh

# Or manually
docker-compose up
```

This will start:
- Postgres (port 5432) - local development only
- Backend API (port 3001)
- Frontend (port 3000)

**Prerequisites:**
- Docker Desktop (or Docker Engine + Docker Compose)
- Environment variables in `.env` file (see `.env.example`)

See [DOCKER.md](./DOCKER.md) for detailed Docker setup instructions.

### Option 2: Local Development

**Prerequisites:**
- Node.js 18+
- pnpm 8.15.9+
- PostgreSQL 14+ (for local development)
- Neon.tech account (for production)
- Chroma Cloud account (for production vector storage)
- Redis (optional, for caching)

**Installation:**

```bash
# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Run database migrations
cd backend && pnpm run db:migrate

# Start development servers (from root)
pnpm run dev
```

### Development URLs

- Frontend: http://localhost:3000
- Backend API: http://localhost:3001
- Backend Health: http://localhost:3001/health
- Postgres: localhost:5432 (if running locally)

## Project Structure

```
.
├── frontend/          # Next.js frontend application
├── backend/           # Mastra backend with agents, tools, workflows
├── database/          # Database migrations and schema
└── docs/              # Documentation
```

## Key Features

- **Multi-OAuth Authentication**: Sign in with Twitter or GitHub, link multiple accounts
- Event-driven listening data capture
- Transcript ingestion and semantic linking
- Influence score calculation
- Fan score tracking
- Automated reporting
- Agent-native API architecture
- GitHub repository integration for append-only data logs

## Authentication

MetaSPN Pro supports OAuth authentication with Twitter and GitHub:

- **Twitter OAuth**: Verify account ownership for community archive import
- **GitHub OAuth**: Login and repository integration
- **Account Linking**: Link multiple OAuth accounts to a single user
- **JWT-based Sessions**: Secure token-based authentication

See [DOCKER.md](./DOCKER.md) for OAuth setup instructions.
