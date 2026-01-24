#!/bin/bash
set -e

# Rollback script
# This script rolls back to the previous deployment

APP_DIR="${APP_DIR:-/opt/metaspn}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🔄 Starting rollback...${NC}"

cd "$APP_DIR" || {
    echo -e "${RED}❌ Application directory not found: ${APP_DIR}${NC}"
    exit 1
}

# Stop current containers
echo "🛑 Stopping current containers..."
docker-compose -f "$COMPOSE_FILE" stop backend frontend worker

# Get previous image tags
PREVIOUS_BACKEND_TAG=$(docker images --format "{{.Tag}}" metaspn-backend | grep -v latest | head -1)
PREVIOUS_FRONTEND_TAG=$(docker images --format "{{.Tag}}" metaspn-frontend | grep -v latest | head -1)

if [ -z "$PREVIOUS_BACKEND_TAG" ] || [ -z "$PREVIOUS_FRONTEND_TAG" ]; then
    echo -e "${RED}❌ No previous images found for rollback${NC}"
    echo "Attempting to restart with current images..."
    docker-compose -f "$COMPOSE_FILE" up -d
    exit 1
fi

echo "📦 Rolling back to previous images..."
echo "  Backend: ${PREVIOUS_BACKEND_TAG}"
echo "  Frontend: ${PREVIOUS_FRONTEND_TAG}"

# Tag previous images as latest
docker tag "metaspn-backend:${PREVIOUS_BACKEND_TAG}" metaspn-backend:latest
docker tag "metaspn-frontend:${PREVIOUS_FRONTEND_TAG}" metaspn-frontend:latest

# Start containers with previous images
echo "🚀 Starting containers with previous images..."
docker-compose -f "$COMPOSE_FILE" up -d --no-deps backend frontend worker

# Wait for services
echo "⏳ Waiting for services to start..."
sleep 30

# Health check
echo "🏥 Running health checks..."
if [ -f "$APP_DIR/scripts/health-check.sh" ]; then
    if "$APP_DIR/scripts/health-check.sh"; then
        echo -e "${GREEN}✅ Rollback successful!${NC}"
    else
        echo -e "${RED}❌ Rollback health check failed${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠️  Health check script not found, skipping...${NC}"
fi

echo -e "${GREEN}✅ Rollback complete!${NC}"
