#!/bin/bash
# Inspect what Mastra actually built - check if our code changes are included

set -e

echo "🔍 Inspecting Mastra Build Output"
echo ""

# Check if we're in the backend directory or repo root
if [ -f "backend/package.json" ]; then
    BACKEND_DIR="backend"
elif [ -f "package.json" ] && grep -q "@metaspn-pro/backend" package.json 2>/dev/null; then
    BACKEND_DIR="."
else
    echo "❌ Not in backend directory or repo root"
    exit 1
fi

BUILD_OUTPUT="$BACKEND_DIR/.mastra/output"

if [ ! -d "$BUILD_OUTPUT" ]; then
    echo "❌ Mastra build output not found at $BUILD_OUTPUT"
    echo "   Run: cd $BACKEND_DIR && pnpm run build"
    exit 1
fi

echo "📋 Build output directory: $BUILD_OUTPUT"
echo ""

# Check main entry point
if [ -f "$BUILD_OUTPUT/index.mjs" ]; then
    echo "✅ Found index.mjs"
    echo "   Size: $(du -h "$BUILD_OUTPUT/index.mjs" | cut -f1)"
    echo ""
    echo "📋 Searching for OAuth config references..."
    if grep -q "oauth-urls" "$BUILD_OUTPUT/index.mjs" 2>/dev/null; then
        echo "   ✅ Found 'oauth-urls' reference"
        echo "   📋 Sample lines:"
        grep -i "oauth-urls\|FRONTEND_URL" "$BUILD_OUTPUT/index.mjs" | head -5
    else
        echo "   ❌ No 'oauth-urls' reference found"
    fi
    
    echo ""
    echo "📋 Searching for console.log statements..."
    LOG_COUNT=$(grep -c "console.log" "$BUILD_OUTPUT/index.mjs" 2>/dev/null || echo "0")
    echo "   Found $LOG_COUNT console.log statements"
    if [ "$LOG_COUNT" -gt 0 ]; then
        echo "   📋 Sample console.log lines:"
        grep "console.log" "$BUILD_OUTPUT/index.mjs" | head -5
    fi
    
    echo ""
    echo "📋 Searching for 'OAuth Config' logs..."
    if grep -q "OAuth Config" "$BUILD_OUTPUT/index.mjs" 2>/dev/null; then
        echo "   ✅ Found 'OAuth Config' log statements"
        grep "OAuth Config" "$BUILD_OUTPUT/index.mjs" | head -3
    else
        echo "   ❌ No 'OAuth Config' log statements found"
    fi
    
    echo ""
    echo "📋 Searching for FRONTEND_URL usage..."
    FRONTEND_COUNT=$(grep -c "FRONTEND_URL" "$BUILD_OUTPUT/index.mjs" 2>/dev/null || echo "0")
    echo "   Found $FRONTEND_URL references"
    if [ "$FRONTEND_COUNT" -gt 0 ]; then
        echo "   📋 Sample FRONTEND_URL references:"
        grep "FRONTEND_URL" "$BUILD_OUTPUT/index.mjs" | head -5
    fi
else
    echo "❌ index.mjs not found in build output"
    echo "   Available files:"
    ls -la "$BUILD_OUTPUT" | head -10
fi

echo ""
echo "✅ Inspection complete!"
