#!/bin/bash
# Check backend startup logs to see environment configuration

set -e

echo "🔍 Checking backend startup logs..."
echo ""

if ! docker compose -f /opt/metaspn/docker-compose.prod.yml ps backend | grep -q "Up"; then
    echo "❌ Backend container is not running"
    exit 1
fi

echo "📋 Full backend logs (last 100 lines):"
echo "----------------------------------------"
docker compose -f /opt/metaspn/docker-compose.prod.yml logs backend --tail=100

echo ""
echo "📋 Looking for FRONTEND_URL or OAuth config:"
echo "----------------------------------------"
docker compose -f /opt/metaspn/docker-compose.prod.yml logs backend --tail=200 | grep -i "frontend\|oauth\|startup" || echo "   (No matching logs found - backend may need to be restarted with new code)"

echo ""
echo "💡 If you don't see startup logs with FRONTEND_URL:"
echo "   1. The backend code needs to be rebuilt and redeployed"
echo "   2. Or restart the backend to see current logs:"
echo "      docker compose -f /opt/metaspn/docker-compose.prod.yml restart backend"
echo "      docker compose -f /opt/metaspn/docker-compose.prod.yml logs -f backend"
