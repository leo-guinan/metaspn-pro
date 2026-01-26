#!/bin/bash
# Diagnostic script to check FRONTEND_URL configuration in production

set -e

echo "🔍 Checking FRONTEND_URL configuration..."
echo ""

# Check .env file
ENV_FILE=""
if [ -f /etc/metaspn/.env.prod ]; then
    ENV_FILE="/etc/metaspn/.env.prod"
elif [ -f /opt/metaspn/.env ]; then
    ENV_FILE="/opt/metaspn/.env"
else
    echo "❌ No .env file found!"
    exit 1
fi

echo "📋 Checking .env file: $ENV_FILE"
if grep -q "^FRONTEND_URL=" "$ENV_FILE"; then
    FRONTEND_URL=$(grep "^FRONTEND_URL=" "$ENV_FILE" | cut -d '=' -f2- | tr -d '"' | tr -d "'")
    echo "   FRONTEND_URL in .env: $FRONTEND_URL"
    
    if echo "$FRONTEND_URL" | grep -qiE "^(https?://)?(localhost|127\.0\.0\.1)"; then
        echo "   ❌ ERROR: FRONTEND_URL is set to localhost!"
        echo "   💡 Fix: Set FRONTEND_URL=https://pro.metaspn.network in $ENV_FILE"
        exit 1
    elif [ -z "$FRONTEND_URL" ]; then
        echo "   ❌ ERROR: FRONTEND_URL is empty!"
        echo "   💡 Fix: Set FRONTEND_URL=https://pro.metaspn.network in $ENV_FILE"
        exit 1
    else
        echo "   ✅ FRONTEND_URL looks correct"
    fi
else
    echo "   ❌ ERROR: FRONTEND_URL not found in .env file!"
    echo "   💡 Fix: Add FRONTEND_URL=https://pro.metaspn.network to $ENV_FILE"
    exit 1
fi

echo ""
echo "🐳 Checking backend container environment..."
if docker compose -f /opt/metaspn/docker-compose.prod.yml ps backend | grep -q "Up"; then
    CONTAINER_FRONTEND_URL=$(docker compose -f /opt/metaspn/docker-compose.prod.yml exec -T backend sh -c 'echo "$FRONTEND_URL"' 2>/dev/null || echo "")
    if [ -z "$CONTAINER_FRONTEND_URL" ]; then
        echo "   ⚠️  WARNING: FRONTEND_URL not set in backend container!"
        echo "   💡 Fix: Restart the backend container:"
        echo "      docker compose -f /opt/metaspn/docker-compose.prod.yml restart backend"
    else
        echo "   Backend container FRONTEND_URL: $CONTAINER_FRONTEND_URL"
        if echo "$CONTAINER_FRONTEND_URL" | grep -qiE "^(https?://)?(localhost|127\.0\.0\.1)"; then
            echo "   ❌ ERROR: Backend container has localhost FRONTEND_URL!"
            echo "   💡 Fix: Restart the backend container with correct .env file:"
            echo "      docker compose -f /opt/metaspn/docker-compose.prod.yml --env-file $ENV_FILE restart backend"
        else
            echo "   ✅ Backend container FRONTEND_URL looks correct"
        fi
    fi
else
    echo "   ⚠️  Backend container is not running"
fi

echo ""
echo "📋 Checking backend logs for FRONTEND_URL..."
docker compose -f /opt/metaspn/docker-compose.prod.yml logs backend --tail=50 | grep -i "FRONTEND_URL\|OAuth Config" || echo "   (No FRONTEND_URL logs found in recent output)"

echo ""
echo "✅ Diagnostic complete!"
echo ""
echo "💡 If FRONTEND_URL is incorrect, fix it and restart:"
echo "   1. Edit $ENV_FILE and set FRONTEND_URL=https://pro.metaspn.network"
echo "   2. Restart backend: docker compose -f /opt/metaspn/docker-compose.prod.yml --env-file $ENV_FILE restart backend"
echo "   3. Verify: docker compose -f /opt/metaspn/docker-compose.prod.yml logs backend | grep 'FRONTEND_URL'"
