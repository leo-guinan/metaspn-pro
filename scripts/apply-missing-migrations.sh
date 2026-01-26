#!/bin/bash
# Apply missing migrations to the database
# This script runs the migration command which will skip already-applied migrations
# and apply any missing ones

set -e

echo "🔄 Applying Missing Migrations"
echo ""

# Check if we're on the server
if [ -f "/opt/metaspn/docker-compose.prod.yml" ]; then
    ENV_FILE="/opt/metaspn/.env"
    if [ ! -f "$ENV_FILE" ] && [ -f "/etc/metaspn/.env.prod" ]; then
        ENV_FILE="/etc/metaspn/.env.prod"
    fi
    
    echo "📋 Running migrations via docker compose..."
    docker compose -f /opt/metaspn/docker-compose.prod.yml --env-file "$ENV_FILE" run --rm backend pnpm run db:migrate
else
    echo "❌ This script should be run on the production server"
    echo "   Expected: /opt/metaspn/docker-compose.prod.yml"
    exit 1
fi

echo ""
echo "✅ Migration check complete!"
