#!/bin/bash
# Fix OAuth redirect to localhost issue

set -e

echo "🔧 Fixing OAuth Redirect Issue"
echo ""

# Find .env file
ENV_FILE=""
if [ -f /etc/metaspn/.env.prod ]; then
    ENV_FILE="/etc/metaspn/.env.prod"
elif [ -f /opt/metaspn/.env ]; then
    ENV_FILE="/opt/metaspn/.env"
else
    echo "❌ No .env file found!"
    exit 1
fi

echo "📋 Using .env file: $ENV_FILE"

# Check FRONTEND_URL
if ! grep -q "^FRONTEND_URL=" "$ENV_FILE"; then
    echo "❌ FRONTEND_URL not found in $ENV_FILE"
    echo "   💡 Add: FRONTEND_URL=https://pro.metaspn.network"
    exit 1
fi

FRONTEND_URL=$(grep "^FRONTEND_URL=" "$ENV_FILE" | cut -d '=' -f2- | tr -d '"' | tr -d "'" | xargs)

if echo "$FRONTEND_URL" | grep -qiE "^(https?://)?(localhost|127\.0\.0\.1)"; then
    echo "❌ FRONTEND_URL is set to localhost: $FRONTEND_URL"
    echo "   💡 Fix: Set FRONTEND_URL=https://pro.metaspn.network in $ENV_FILE"
    exit 1
fi

echo "✅ FRONTEND_URL is correct: $FRONTEND_URL"
echo ""

# Check if backend is running
if ! docker compose -f /opt/metaspn/docker-compose.prod.yml ps backend | grep -q "Up"; then
    echo "❌ Backend container is not running"
    exit 1
fi

# Check what the container currently sees
CONTAINER_FRONTEND_URL=$(docker compose -f /opt/metaspn/docker-compose.prod.yml exec -T backend sh -c 'echo "$FRONTEND_URL"' 2>/dev/null || echo "")

if [ "$CONTAINER_FRONTEND_URL" != "$FRONTEND_URL" ]; then
    echo "⚠️  Container has different FRONTEND_URL: $CONTAINER_FRONTEND_URL"
    echo "   Restarting backend to pick up correct value..."
    echo ""
    
    cd /opt/metaspn
    docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" restart backend
    
    echo ""
    echo "⏳ Waiting for backend to restart..."
    sleep 5
    
    # Verify it's now correct
    NEW_CONTAINER_FRONTEND_URL=$(docker compose -f /opt/metaspn/docker-compose.prod.yml exec -T backend sh -c 'echo "$FRONTEND_URL"' 2>/dev/null || echo "")
    
    if [ "$NEW_CONTAINER_FRONTEND_URL" = "$FRONTEND_URL" ]; then
        echo "✅ Backend now has correct FRONTEND_URL"
    else
        echo "⚠️  Backend still has: $NEW_CONTAINER_FRONTEND_URL"
        echo "   Trying force recreate..."
        docker compose -f /opt/metaspn/docker-compose.prod.yml --env-file "$ENV_FILE" up -d --force-recreate backend
        sleep 5
    fi
else
    echo "✅ Container already has correct FRONTEND_URL"
fi

echo ""
echo "📋 Checking backend logs for FRONTEND_URL..."
docker compose -f /opt/metaspn/docker-compose.prod.yml logs backend --tail=50 | grep -i "frontend\|oauth config" || echo "   (No logs found - backend may need to be restarted)"

echo ""
echo "✅ Fix complete!"
echo ""
echo "🧪 Test OAuth login and check logs:"
echo "   docker compose -f /opt/metaspn/docker-compose.prod.yml logs backend --tail=100 | grep -i 'oauth\|redirect'"
