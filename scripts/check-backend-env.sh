#!/bin/bash
# Check what environment variables the backend container is actually seeing

set -e

echo "🔍 Checking backend container environment variables..."
echo ""

# Check if backend is running
if ! docker compose -f /opt/metaspn/docker-compose.prod.yml ps backend | grep -q "Up"; then
    echo "❌ Backend container is not running"
    exit 1
fi

echo "📋 Environment variables in backend container:"
echo ""

# Check FRONTEND_URL specifically
FRONTEND_URL=$(docker compose -f /opt/metaspn/docker-compose.prod.yml exec -T backend sh -c 'echo "$FRONTEND_URL"' 2>/dev/null || echo "NOT SET")
echo "FRONTEND_URL: ${FRONTEND_URL}"

# Check NODE_ENV
NODE_ENV=$(docker compose -f /opt/metaspn/docker-compose.prod.yml exec -T backend sh -c 'echo "$NODE_ENV"' 2>/dev/null || echo "NOT SET")
echo "NODE_ENV: ${NODE_ENV}"

# Check all environment variables (filter sensitive ones)
echo ""
echo "📋 All environment variables (non-sensitive):"
docker compose -f /opt/metaspn/docker-compose.prod.yml exec -T backend sh -c 'env | grep -v -i "secret\|key\|password\|token" | sort' 2>/dev/null || echo "Could not read environment variables"

echo ""
echo "📋 Backend logs (last 50 lines, looking for FRONTEND_URL):"
docker compose -f /opt/metaspn/docker-compose.prod.yml logs backend --tail=50 | grep -i "frontend\|oauth" || echo "No FRONTEND_URL or OAuth logs found"

echo ""
echo "✅ Check complete!"
