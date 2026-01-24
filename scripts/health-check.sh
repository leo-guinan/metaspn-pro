#!/bin/bash
set -e

# Health check script
# This script verifies that all services are healthy after deployment

FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"
BACKEND_URL="${BACKEND_URL:-http://localhost:3001}"
MAX_RETRIES=5
RETRY_DELAY=10

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_service() {
    local url=$1
    local service_name=$2
    
    for i in $(seq 1 $MAX_RETRIES); do
        if curl -f -s "$url" > /dev/null 2>&1; then
            echo -e "${GREEN}✅ ${service_name} is healthy${NC}"
            return 0
        else
            if [ $i -lt $MAX_RETRIES ]; then
                echo -e "${YELLOW}⏳ ${service_name} not ready, retrying... (${i}/${MAX_RETRIES})${NC}"
                sleep $RETRY_DELAY
            else
                echo -e "${RED}❌ ${service_name} health check failed after ${MAX_RETRIES} attempts${NC}"
                return 1
            fi
        fi
    done
    
    return 1
}

echo "🏥 Running health checks..."

# Check backend health
echo "Checking backend..."
if ! check_service "${BACKEND_URL}/health" "Backend"; then
    exit 1
fi

# Check frontend (try root and health endpoint)
echo "Checking frontend..."
if ! check_service "$FRONTEND_URL" "Frontend"; then
    # Try health endpoint if root fails
    if ! check_service "${FRONTEND_URL}/api/health" "Frontend"; then
        exit 1
    fi
fi

# Check Docker containers
echo "Checking Docker containers..."
if ! docker ps | grep -q "metaspn-backend-prod.*Up"; then
    echo -e "${RED}❌ Backend container is not running${NC}"
    exit 1
fi

if ! docker ps | grep -q "metaspn-frontend-prod.*Up"; then
    echo -e "${RED}❌ Frontend container is not running${NC}"
    exit 1
fi

if ! docker ps | grep -q "metaspn-postgres-prod.*Up"; then
    echo -e "${RED}❌ Database container is not running${NC}"
    exit 1
fi

# Check database connection
echo "Checking database connection..."
if docker exec metaspn-postgres-prod pg_isready -U metaspn > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Database is healthy${NC}"
else
    echo -e "${RED}❌ Database connection failed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ All health checks passed!${NC}"
