#!/bin/bash
# Debug OAuth redirect issues - check what URLs are being generated

set -e

echo "🔍 Debugging OAuth Redirect Issues"
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
    FRONTEND_URL=$(grep "^FRONTEND_URL=" "$ENV_FILE" | cut -d '=' -f2- | tr -d '"' | tr -d "'" | xargs)
    echo "   FRONTEND_URL in .env: $FRONTEND_URL"
else
    echo "   ❌ FRONTEND_URL not found in .env file!"
    exit 1
fi

echo ""
echo "🐳 Checking backend container..."

if ! docker compose -f /opt/metaspn/docker-compose.prod.yml ps backend | grep -q "Up"; then
    echo "❌ Backend container is not running"
    exit 1
fi

# Check what the container sees
CONTAINER_FRONTEND_URL=$(docker compose -f /opt/metaspn/docker-compose.prod.yml exec -T backend sh -c 'echo "$FRONTEND_URL"' 2>/dev/null || echo "")
echo "   FRONTEND_URL in container: ${CONTAINER_FRONTEND_URL:-NOT SET}"

# Check backend logs for FRONTEND_URL
echo ""
echo "📋 Backend startup logs (looking for FRONTEND_URL):"
docker compose -f /opt/metaspn/docker-compose.prod.yml logs backend | grep -i "frontend\|oauth config" | tail -10 || echo "   (No FRONTEND_URL logs found)"

echo ""
echo "📋 Recent OAuth activity in logs:"
docker compose -f /opt/metaspn/docker-compose.prod.yml logs backend --tail=100 | grep -i "oauth\|redirect" | tail -20 || echo "   (No OAuth logs found)"

echo ""
echo "🧪 Testing OAuth login endpoint (this will show what callback URL is generated):"
echo "   Run this to see what callback URL is sent to GitHub/Twitter:"
echo "   curl -v http://localhost:3001/api/auth/github/login 2>&1 | grep -i 'location\|callback'"
echo ""
echo "   Or check the backend logs after attempting login:"
echo "   docker compose -f /opt/metaspn/docker-compose.prod.yml logs backend --tail=50 | grep -i 'oauth\|callback\|redirect'"

echo ""
echo "💡 If FRONTEND_URL is wrong in container:"
echo "   1. Verify .env file has correct value"
echo "   2. Restart backend: docker compose -f /opt/metaspn/docker-compose.prod.yml --env-file $ENV_FILE restart backend"
echo "   3. Check logs: docker compose -f /opt/metaspn/docker-compose.prod.yml logs backend | grep 'FRONTEND_URL'"

echo ""
echo "✅ Diagnostic complete!"
