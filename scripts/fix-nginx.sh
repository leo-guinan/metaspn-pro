#!/bin/bash
# Quick fix script to get Nginx running
# Run this on the server as root or with sudo

set -e

echo "🔧 Fixing Nginx setup..."

# 1. Copy SSL certificates to Nginx location (run as root – letsencrypt is root-only)
echo "📋 Copying SSL certificates..."
mkdir -p /etc/nginx/ssl
if [ -f /etc/letsencrypt/live/pro.metaspn.network/fullchain.pem ]; then
    cp /etc/letsencrypt/live/pro.metaspn.network/fullchain.pem /etc/nginx/ssl/
    cp /etc/letsencrypt/live/pro.metaspn.network/privkey.pem /etc/nginx/ssl/
    chmod 640 /etc/nginx/ssl/fullchain.pem /etc/nginx/ssl/privkey.pem
    chown root:metaspn /etc/nginx/ssl/fullchain.pem /etc/nginx/ssl/privkey.pem 2>/dev/null || true
    echo "✅ SSL certificates copied (readable by metaspn for deploy)"
else
    echo "❌ SSL certificates not found at /etc/letsencrypt/live/pro.metaspn.network/"
    echo "   Run: sudo certbot certonly --standalone -d pro.metaspn.network"
    exit 1
fi

# 2. Build Nginx image
echo "🔨 Building Nginx image..."
cd /opt/metaspn
docker compose -f docker-compose.prod.yml build nginx || {
    echo "❌ Failed to build Nginx image"
    echo "   Checking if nginx directory exists..."
    if [ ! -d "/opt/metaspn/nginx" ]; then
        echo "   ❌ nginx directory not found!"
        echo "   💡 The deployment should download it, but you can manually create it:"
        echo "      mkdir -p /opt/metaspn/nginx/conf.d"
        exit 1
    fi
    exit 1
}

# 3. Start Nginx
echo "🚀 Starting Nginx..."
docker compose -f docker-compose.prod.yml up -d nginx || {
    echo "❌ Failed to start Nginx"
    echo "📋 Checking logs..."
    docker compose -f docker-compose.prod.yml logs nginx
    exit 1
}

# 4. Verify Nginx is running
sleep 3
if docker compose -f docker-compose.prod.yml ps nginx | grep -q "Up"; then
    echo "✅ Nginx is running!"
    docker compose -f docker-compose.prod.yml ps nginx
else
    echo "❌ Nginx failed to start"
    docker compose -f docker-compose.prod.yml logs nginx
    exit 1
fi

# 5. Test ports
echo "🔍 Testing ports..."
if netstat -tuln 2>/dev/null | grep -q ":80 " || ss -tuln 2>/dev/null | grep -q ":80 "; then
    echo "✅ Port 80 is listening"
else
    echo "⚠️  Port 80 is not listening"
fi

if netstat -tuln 2>/dev/null | grep -q ":443 " || ss -tuln 2>/dev/null | grep -q ":443 "; then
    echo "✅ Port 443 is listening"
else
    echo "⚠️  Port 443 is not listening"
fi

echo ""
echo "✅ Nginx setup complete!"
echo "   Test: curl -I http://pro.metaspn.network"
