#!/bin/bash
# Test what callback URL the backend is generating for OAuth

set -e

echo "🧪 Testing OAuth Callback URL Generation"
echo ""

if ! docker compose -f /opt/metaspn/docker-compose.prod.yml ps backend | grep -q "Up"; then
    echo "❌ Backend container is not running"
    exit 1
fi

echo "📋 Checking what callback URL backend generates for GitHub OAuth..."
echo ""

# Make a request to the login endpoint and capture the redirect
RESPONSE=$(curl -s -i "http://localhost:3001/api/auth/github/login" 2>&1 || echo "FAILED")

if echo "$RESPONSE" | grep -q "Location:"; then
    LOCATION=$(echo "$RESPONSE" | grep -i "Location:" | head -1)
    echo "✅ GitHub OAuth redirect found:"
    echo "   $LOCATION"
    echo ""
    
    # Extract the callback URL from the Location header
    if echo "$LOCATION" | grep -q "redirect_uri="; then
        CALLBACK_URL=$(echo "$LOCATION" | sed -n 's/.*redirect_uri=\([^&]*\).*/\1/p' | sed 's/%2F/\//g' | sed 's/%3A/:/g' | sed 's/%3F/?/g' | sed 's/%3D/=/g' | sed 's/%26/\&/g')
        CALLBACK_URL_DECODED=$(python3 -c "import sys, urllib.parse; print(urllib.parse.unquote(sys.argv[1]))" "$CALLBACK_URL" 2>/dev/null || echo "$CALLBACK_URL")
        
        echo "📋 Extracted callback URL:"
        echo "   $CALLBACK_URL_DECODED"
        echo ""
        
        if echo "$CALLBACK_URL_DECODED" | grep -qiE "(localhost|127\.0\.0\.1)"; then
            echo "❌ PROBLEM: Callback URL contains localhost!"
            echo "   This means FRONTEND_URL is not being used correctly"
            echo "   Expected: https://pro.metaspn.network/api/auth/github/callback"
            echo "   Got: $CALLBACK_URL_DECODED"
        else
            echo "✅ Callback URL looks correct (no localhost)"
        fi
    fi
else
    echo "❌ Could not get OAuth redirect"
    echo "   Response:"
    echo "$RESPONSE" | head -20
fi

echo ""
echo "📋 Checking backend environment variable:"
FRONTEND_URL=$(docker compose -f /opt/metaspn/docker-compose.prod.yml exec -T backend sh -c 'echo "$FRONTEND_URL"' 2>/dev/null || echo "NOT SET")
echo "   FRONTEND_URL in container: ${FRONTEND_URL}"

echo ""
echo "💡 If callback URL is wrong:"
echo "   1. Verify .env file has FRONTEND_URL=https://pro.metaspn.network"
echo "   2. Restart backend: docker compose -f /opt/metaspn/docker-compose.prod.yml --env-file /opt/metaspn/.env restart backend"
echo "   3. Rebuild and redeploy backend with new logging code"
