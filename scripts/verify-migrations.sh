#!/bin/bash
# Verify all migrations have been applied to the database

set -e

echo "🔍 Verifying Database Migrations"
echo ""

# Check if we're in a container or on the server
if [ -f "/app/backend/database/migrate.ts" ]; then
    # Running in container
    echo "📋 Running in container, checking migrations..."
    cd /app/backend
    pnpm run db:migrate
elif [ -f "/opt/metaspn/backend/database/migrate.ts" ]; then
    # Running on server
    echo "📋 Running on server, checking migrations via container..."
    docker compose -f /opt/metaspn/docker-compose.prod.yml run --rm backend pnpm run db:migrate
else
    echo "❌ Migration script not found"
    echo "   Expected locations:"
    echo "   - /app/backend/database/migrate.ts (in container)"
    echo "   - /opt/metaspn/backend/database/migrate.ts (on server)"
    exit 1
fi

echo ""
echo "✅ Migration verification complete!"
