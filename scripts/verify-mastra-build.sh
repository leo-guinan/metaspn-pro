#!/bin/bash
# Verify what Mastra actually built - check if src/index.ts is included

set -e

echo "🔍 Verifying Mastra Build Contents"
echo ""

# Check if running in container or on server
if [ -f "/app/backend/.mastra/output/index.mjs" ]; then
    BUILD_FILE="/app/backend/.mastra/output/index.mjs"
    echo "📋 Checking build in container: $BUILD_FILE"
elif [ -f "/opt/metaspn/backend/.mastra/output/index.mjs" ]; then
    BUILD_FILE="/opt/metaspn/backend/.mastra/output/index.mjs"
    echo "📋 Checking build on server: $BUILD_FILE"
elif docker compose -f /opt/metaspn/docker-compose.prod.yml ps backend 2>/dev/null | grep -q "Up"; then
    echo "📋 Checking build in running backend container..."
    docker compose -f /opt/metaspn/docker-compose.prod.yml exec -T backend sh -c "
        if [ -f /app/backend/.mastra/output/index.mjs ]; then
            echo 'Build file exists'
            echo 'File size:' \$(du -h /app/backend/.mastra/output/index.mjs | cut -f1)
            echo ''
            echo 'Searching for oauth-urls references...'
            grep -o 'oauth-urls' /app/backend/.mastra/output/index.mjs 2>/dev/null | wc -l | xargs echo 'Found:'
            echo ''
            echo 'Searching for FRONTEND_URL references...'
            grep -o 'FRONTEND_URL' /app/backend/.mastra/output/index.mjs 2>/dev/null | wc -l | xargs echo 'Found:'
            echo ''
            echo 'Searching for OAuth Config logs...'
            grep -c 'OAuth Config' /app/backend/.mastra/output/index.mjs 2>/dev/null || echo '0'
            echo ''
            echo 'Searching for index.ts import in mastra/index...'
            grep -c '../index' /app/backend/.mastra/output/index.mjs 2>/dev/null || echo '0'
        else
            echo 'Build file not found'
        fi
    "
    exit 0
else
    echo "❌ Cannot find build file or running container"
    exit 1
fi

if [ -f "$BUILD_FILE" ]; then
    echo "✅ Build file found: $BUILD_FILE"
    echo "   Size: $(du -h "$BUILD_FILE" | cut -f1)"
    echo ""
    
    echo "📋 Searching for key indicators..."
    
    OAUTH_REFS=$(grep -o 'oauth-urls' "$BUILD_FILE" 2>/dev/null | wc -l | xargs)
    echo "   oauth-urls references: $OAUTH_REFS"
    
    FRONTEND_REFS=$(grep -o 'FRONTEND_URL' "$BUILD_FILE" 2>/dev/null | wc -l | xargs)
    echo "   FRONTEND_URL references: $FRONTEND_REFS"
    
    OAUTH_CONFIG_LOGS=$(grep -c 'OAuth Config' "$BUILD_FILE" 2>/dev/null || echo "0")
    echo "   'OAuth Config' log statements: $OAUTH_CONFIG_LOGS"
    
    INDEX_IMPORT=$(grep -c '../index' "$BUILD_FILE" 2>/dev/null || echo "0")
    echo "   '../index' import references: $INDEX_IMPORT"
    
    CONSOLE_LOGS=$(grep -c 'console.log' "$BUILD_FILE" 2>/dev/null || echo "0")
    echo "   console.log statements: $CONSOLE_LOGS"
    
    echo ""
    if [ "$OAUTH_REFS" -gt 0 ] || [ "$FRONTEND_REFS" -gt 0 ]; then
        echo "✅ Build appears to include OAuth code!"
        echo "   Sample matches:"
        grep -i "oauth-urls\|FRONTEND_URL" "$BUILD_FILE" | head -3
    else
        echo "❌ Build does NOT include OAuth code"
        echo "   This confirms src/index.ts is not being included in the build"
    fi
else
    echo "❌ Build file not found: $BUILD_FILE"
    exit 1
fi

echo ""
echo "✅ Verification complete!"
