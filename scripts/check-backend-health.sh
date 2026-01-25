#!/bin/bash
# Check why backend is unhealthy

set -e

echo "🔍 Checking backend health..."

cd /opt/metaspn

# Check container status
echo "📋 Container status:"
docker compose -f docker-compose.prod.yml ps backend

# Check logs
echo ""
echo "📋 Backend logs (last 50 lines):"
docker compose -f docker-compose.prod.yml logs backend --tail=50

# Test health endpoint from inside container
echo ""
echo "🔍 Testing health endpoint from inside container:"
docker compose -f docker-compose.prod.yml exec backend node -e "require('http').get('http://localhost:3001/health', (r) => {let data=''; r.on('data',d=>data+=d); r.on('end',()=>{console.log('Status:',r.statusCode); console.log('Response:',data); process.exit(r.statusCode===200?0:1)})})" || echo "Health check failed"

# Test from host
echo ""
echo "🔍 Testing from host (localhost:3001):"
curl -v http://localhost:3001/health || echo "Connection failed"

# Check if port is bound
echo ""
echo "🔍 Checking port binding:"
docker compose -f docker-compose.prod.yml ps backend | grep -o "127.0.0.1:3001->3001" || echo "Port not bound correctly"

# Check environment variables
echo ""
echo "🔍 Checking critical environment variables:"
docker compose -f docker-compose.prod.yml exec backend sh -c 'echo "DATABASE_URL: ${DATABASE_URL:+SET}"' || true
docker compose -f docker-compose.prod.yml exec backend sh -c 'echo "NODE_ENV: ${NODE_ENV:-NOT SET}"' || true
