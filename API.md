# MetaSPN Pro API Documentation

## Overview

MetaSPN Pro uses Mastra framework which auto-generates REST API endpoints from tools and agents. All endpoints follow the agent-native parity principle.

## Base URL

```
http://localhost:3001
```

## Authentication

Currently, authentication is handled via user_id in request body/query params. In production, use API keys or OAuth tokens.

## Endpoints

### Health Check

```http
GET /health
```

Returns server status.

### OpenAPI Documentation

```http
GET /api/docs
```

Interactive API documentation.

### Events

#### List Events

```http
GET /api/events?user_id={uuid}&episode_id={uuid}&limit=100&offset=0
```

List listening events with optional filters.

#### Create Event

```http
POST /api/events
Content-Type: application/json

{
  "user_id": "uuid",
  "episode_id": "uuid",
  "podcast_id": "uuid",
  "event_type": "play",
  "timestamp_utc": "2026-01-23T15:24:11Z",
  "playhead_sec": 1832.4,
  "episode_duration_sec": 4210,
  "client": "web",
  "metadata": {}
}
```

Ingest a listening event.

### Expressions

#### Create Expression

```http
POST /api/expressions
Content-Type: application/json

{
  "user_id": "uuid",
  "text": "Great episode about time compression!",
  "source": "manual",
  "timestamp_utc": "2026-01-23T15:24:11Z"
}
```

Create a new expression (note, tweet, post).

### Exports

#### Fan Summary

```http
GET /api/exports/fan-summary?user_id={uuid}&format=markdown
```

Export fan summary in JSON, Markdown, or PDF.

#### Influence Digest

```http
GET /api/exports/influence-digest?user_id={uuid}&format=markdown
```

Export monthly influence digest.

#### Event Ledger

```http
GET /api/exports/event-ledger?user_id={uuid}&format=jsonl
```

Export full event ledger in JSONL or CSV format.

## Tools Available to Agents

All tools are accessible programmatically via Mastra agents:

- `ingest_listening_event` - Ingest event
- `list_events` - List events
- `discover_transcript` - Find transcript URL
- `parse_transcript` - Parse transcript file
- `chunk_transcript` - Chunk transcript
- `generate_embeddings` - Generate embeddings
- `store_transcript_chunks` - Store chunks
- `calculate_completion_ratio` - Calculate completion
- `calculate_fan_score` - Calculate fan score
- `calculate_influence_score` - Calculate influence
- `find_recent_episodes` - Find recent episodes
- `compute_similarity` - Compute similarity
- `create_influence_link` - Create link
- `export_fan_summary` - Export fan summary
- `export_influence_digest` - Export digest
- `export_event_ledger` - Export ledger

## Workflows

Workflows can be triggered via API or run on schedule:

- `process_transcript_workflow` - Process transcript
- `transcript_discovery_workflow` - Discover transcripts (daily)
- `influence_linking_workflow` - Link influences (hourly)
- `generate_daily_report_workflow` - Daily reports (midnight)
- `monthly_digest_workflow` - Monthly digests (1st of month)

## Error Handling

All endpoints return standard HTTP status codes:

- `200` - Success
- `400` - Bad Request
- `404` - Not Found
- `500` - Internal Server Error

Error responses include a message:

```json
{
  "error": "Error message"
}
```
