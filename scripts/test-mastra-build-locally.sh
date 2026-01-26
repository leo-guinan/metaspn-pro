#!/bin/bash
# Test Mastra build locally to see if src/index.ts is included

set -e

echo "🧪 Testing Mastra Build Locally"
echo ""

# Check if we're in the right directory
if [ ! -f "backend/package.json" ]; then
    echo "❌ Run this from the repo root (where backend/ directory exists)"
    exit 1
fi

cd backend

echo "📋 Current directory: $(pwd)"
echo ""

# Clean previous build
echo "🧹 Cleaning previous build..."
rm -rf .mastra/output 2>/dev/null || true

# Build
echo "🔨 Building with Mastra..."
pnpm run build

echo ""
echo "📋 Checking build output..."

if [ ! -f ".mastra/output/index.mjs" ]; then
    echo "❌ Build failed - no index.mjs found"
    exit 1
fi

echo "✅ Build completed"
echo "   Build file: .mastra/output/index.mjs"
echo "   Size: $(du -h .mastra/output/index.mjs | cut -f1)"
echo ""

# Check for our code
echo "🔍 Searching for OAuth code in build..."

OAUTH_REFS=$(grep -o 'oauth-urls' .mastra/output/index.mjs 2>/dev/null | wc -l | xargs)
FRONTEND_REFS=$(grep -o 'FRONTEND_URL' .mastra/output/index.mjs 2>/dev/null | wc -l | xargs)
OAUTH_CONFIG=$(grep -c 'OAuth Config' .mastra/output/index.mjs 2>/dev/null || echo "0")
INDEX_IMPORT=$(grep -c '../index' .mastra/output/index.mjs 2>/dev/null || echo "0")

echo "   oauth-urls references: $OAUTH_REFS"
echo "   FRONTEND_URL references: $FRONTEND_REFS"
echo "   'OAuth Config' logs: $OAUTH_CONFIG"
echo "   '../index' imports: $INDEX_IMPORT"
echo ""

if [ "$OAUTH_REFS" -gt 0 ] || [ "$FRONTEND_REFS" -gt 0 ]; then
    echo "✅ SUCCESS: Build includes OAuth code!"
    echo "   Sample matches:"
    grep -i "oauth-urls\|FRONTEND_URL" .mastra/output/index.mjs | head -3
    echo ""
    echo "✅ The import is working - code is included in build"
else
    echo "❌ FAILURE: Build does NOT include OAuth code"
    echo "   This means the import in src/mastra/index.ts isn't working"
    echo "   Possible causes:"
    echo "   1. Circular dependency is preventing inclusion"
    echo "   2. Bundler is tree-shaking out unused code"
    echo "   3. Build is failing silently"
    echo ""
    echo "   Checking for build errors..."
    if grep -i "error\|warning\|circular" .mastra/.build/*.log 2>/dev/null; then
        echo "   Found build warnings/errors above"
    else
        echo "   No obvious build errors found"
    fi
fi

echo ""
echo "✅ Test complete!"
