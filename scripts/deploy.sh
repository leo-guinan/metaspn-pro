#!/bin/bash
set -e

# Deployment script (runs on server)
# This script is called by GitHub Actions to deploy the application

APP_DIR="${APP_DIR:-/opt/metaspn}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🚀 Starting deployment..."

cd "$APP_DIR" || {
    echo -e "${RED}❌ Application directory not found: ${APP_DIR}${NC}"
    exit 1
}

# Validate secrets
if [ -f "$APP_DIR/scripts/validate-secrets.sh" ]; then
    echo "🔍 Validating secrets..."
    "$APP_DIR/scripts/validate-secrets.sh" || {
        echo -e "${RED}❌ Secret validation failed${NC}"
        exit 1
    }
fi

# Pull latest images
echo "📥 Pulling latest images..."
docker compose -f "$COMPOSE_FILE" pull backend frontend || {
    echo -e "${RED}❌ Failed to pull images${NC}"
    exit 1
}

# Run database migrations
echo "🔄 Running database migrations..."
if [ -f "$APP_DIR/scripts/run-migrations.sh" ]; then
    docker compose -f "$COMPOSE_FILE" run --rm backend /scripts/run-migrations.sh || {
        echo -e "${YELLOW}⚠️  Migration failed, but continuing deployment...${NC}"
    }
fi

# Deploy new containers
echo "🚀 Deploying new containers..."
docker compose -f "$COMPOSE_FILE" up -d --no-deps backend frontend worker || {
    echo -e "${RED}❌ Failed to start containers${NC}"
    exit 1
}

# Wait for services to be healthy
echo "⏳ Waiting for services to be healthy..."
sleep 30

# Health check
echo "🏥 Running health checks..."
if [ -f "$APP_DIR/scripts/health-check.sh" ]; then
    "$APP_DIR/scripts/health-check.sh" || {
        echo -e "${RED}❌ Health check failed, rolling back...${NC}"
        "$APP_DIR/scripts/rollback.sh"
        exit 1
    }
fi

# Clean up old images
echo "🧹 Cleaning up old images..."
docker image prune -f

echo -e "${GREEN}✅ Deployment complete!${NC}"
