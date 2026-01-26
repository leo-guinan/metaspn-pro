#!/bin/bash
# Script to diagnose and fix disk space issues on production server

set -e

echo "🔍 Checking disk space..."
echo ""

# Check overall disk usage
df -h / | tail -1 | awk '{print "Disk usage: " $5 " used (" $3 " / " $2 ")"}'
echo ""

# Check Docker disk usage
echo "🐳 Docker disk usage:"
docker system df
echo ""

# Check if we're running low on space
AVAILABLE_SPACE=$(df / | tail -1 | awk '{print $4}')
AVAILABLE_SPACE_MB=$((AVAILABLE_SPACE / 1024))

echo "Available space: ${AVAILABLE_SPACE_MB}MB"
echo ""

if [ $AVAILABLE_SPACE_MB -lt 1000 ]; then
    echo "⚠️  WARNING: Less than 1GB available. Cleaning up Docker resources..."
    echo ""
    
    # Stop containers to free up space during cleanup
    echo "🛑 Stopping containers (will restart after cleanup)..."
    cd /opt/metaspn
    docker compose -f docker-compose.prod.yml stop backend worker frontend nginx 2>/dev/null || true
    
    # Remove unused images (not just dangling)
    echo "🧹 Removing unused Docker images..."
    docker image prune -a -f --filter "until=24h" || docker image prune -a -f
    
    # Remove unused containers
    echo "🧹 Removing stopped containers..."
    docker container prune -f
    
    # Remove unused volumes (be careful - this removes volumes not used by any container)
    echo "🧹 Removing unused volumes..."
    docker volume prune -f
    
    # Remove build cache
    echo "🧹 Removing build cache..."
    docker builder prune -a -f --filter "until=24h" || docker builder prune -a -f
    
    # System prune (removes everything unused)
    echo "🧹 Running full system prune..."
    docker system prune -a -f --volumes --filter "until=24h" || docker system prune -a -f --volumes
    
    echo ""
    echo "✅ Cleanup complete!"
    echo ""
    
    # Show new disk usage
    echo "📊 New disk usage:"
    df -h / | tail -1 | awk '{print "Disk usage: " $5 " used (" $3 " / " $2 ")"}'
    docker system df
    echo ""
    
    # Restart containers
    echo "🚀 Restarting containers..."
    docker compose -f docker-compose.prod.yml --env-file /opt/metaspn/.env up -d backend worker frontend nginx 2>/dev/null || \
    docker compose -f docker-compose.prod.yml --env-file /etc/metaspn/.env.prod up -d backend worker frontend nginx 2>/dev/null || \
    docker compose -f docker-compose.prod.yml up -d backend worker frontend nginx
    
    echo ""
    echo "✅ Containers restarted"
else
    echo "✅ Sufficient disk space available"
    echo ""
    echo "💡 If you want to clean up anyway, run:"
    echo "   docker system prune -a -f --volumes"
fi

echo ""
echo "📋 Summary:"
echo "   - Check disk space: df -h"
echo "   - Check Docker usage: docker system df"
echo "   - Clean up everything: docker system prune -a -f --volumes"
echo "   - Clean up old images: docker image prune -a -f"
echo ""
