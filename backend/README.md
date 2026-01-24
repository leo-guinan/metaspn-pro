# MetaSPN Pro Backend

Mastra-based agent-native backend for podcast intelligence layer.

## Architecture

- **Mastra Framework**: Agent-native TypeScript framework
- **Hono HTTP Server**: Lightweight, fast HTTP server
- **PostgreSQL**: Database with pgvector extension
- **OpenAI/Anthropic**: LLM providers for agents

## Project Structure

```
backend/
├── src/
│   ├── index.ts                 # Main server entry point
│   ├── db/                      # Database connection
│   └── mastra/
│       ├── tools/               # Composable tools (parity principle)
│       ├── agents/              # AI workers
│       └── workflows/           # Orchestration and scheduling
├── database/
│   └── schema.sql              # Database schema
└── mastra.config.ts            # Mastra configuration
```

## Key Components

### Tools
- Event ingestion
- Transcript processing
- Metrics calculation
- Influence linking
- Export generation

### Agents
- Event ingestion agent
- Influence linking agent
- Daily report agent
- Influence digest agent
- Expression import agent

### Workflows
- Transcript discovery (daily at 2 AM)
- Transcript processing
- Influence linking (hourly)
- Daily report generation (midnight UTC)
- Monthly digest (1st of month)

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Run production server
npm start
```

## Environment Variables

```env
DATABASE_URL=postgresql://localhost:5432/metaspn
OPENAI_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
```

## API Endpoints

All endpoints are auto-generated from Mastra tools and agents.

- `GET /health` - Health check
- `GET /api/docs` - OpenAPI documentation
- `POST /api/events` - Ingest listening event
- `GET /api/events` - List events
- `POST /api/expressions` - Create expression
- `GET /api/exports/*` - Export endpoints

See OpenAPI docs at `/api/docs` for full API specification.
