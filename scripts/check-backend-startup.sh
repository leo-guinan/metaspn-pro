#!/bin/bash
# Check why backend isn't starting properly

set -e

echo "🔍 Checking backend startup issues..."

cd /opt/metaspn

# Check if the Mastra output exists
echo "📋 Checking Mastra build output..."
docker compose -f docker-compose.prod.yml exec backend ls -la /app/backend/.mastra/output/ 2>/dev/null || {
    echo "❌ .mastra/output directory not found or not accessible"
    echo "   The backend may not have been built correctly"
}

# Check what command is actually running
echo ""
echo "📋 Container process:"
docker compose -f docker-compose.prod.yml exec backend ps aux || echo "Cannot check processes"

# Check full logs
echo ""
echo "📋 Full backend logs:"
docker compose -f docker-compose.prod.yml logs backend --tail=100

# Check if port is actually listening inside container
echo ""
echo "📋 Checking if port 3001 is listening inside container:"
docker compose -f docker-compose.prod.yml exec backend netstat -tuln 2>/dev/null | grep 3001 || \
docker compose -f docker-compose.prod.yml exec backend ss -tuln 2>/dev/null | grep 3001 || \
echo "Port 3001 not listening inside container"

# Check environment variables
echo ""
echo "📋 Critical environment variables:"
docker compose -f docker-compose.prod.yml exec backend sh -c 'echo "DATABASE_URL: ${DATABASE_URL:+SET (hidden)}"' 2>/dev/null || true
docker compose -f docker-compose.prod.yml exec backend sh -c 'echo "NODE_ENV: ${NODE_ENV:-NOT SET}"' 2>/dev/null || true
docker compose -f docker-compose.prod.yml exec backend sh -c 'echo "CHROMA_API_KEY: ${CHROMA_API_KEY:+SET (hidden)}"' 2>/dev/null || true

# Try to manually start the server
echo ""
echo "📋 Attempting to check Mastra output file:"
docker compose -f docker-compose.prod.yml exec backend test -f /app/backend/.mastra/output/index.mjs && \
    echo "✅ Mastra output file exists" || \
    echo "❌ Mastra output file NOT found at /app/backend/.mastra/output/index.mjs"

echo ""
echo "💡 If Mastra output is missing, the build may have failed"
echo "   Check CI logs to see if the backend build succeeded"
