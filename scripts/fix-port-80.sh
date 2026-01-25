#!/bin/bash
# Script to identify and fix port 80 conflicts for certbot

echo "🔍 Checking what's using port 80..."

# Check what's listening on port 80
if command -v ss > /dev/null 2>&1; then
    echo "Using 'ss' command:"
    ss -tlnp | grep :80
elif command -v netstat > /dev/null 2>&1; then
    echo "Using 'netstat' command:"
    netstat -tlnp | grep :80
else
    echo "Checking with lsof:"
    lsof -i :80 || echo "lsof not available"
fi

echo ""
echo "Checking for common services:"

# Check for Apache
if systemctl is-active --quiet apache2 2>/dev/null; then
    echo "⚠️  Apache2 is running"
    echo "   Stopping Apache2..."
    systemctl stop apache2
    systemctl disable apache2
fi

# Check for Nginx
if systemctl is-active --quiet nginx 2>/dev/null; then
    echo "⚠️  Nginx is running"
    echo "   Stopping Nginx..."
    systemctl stop nginx
    systemctl disable nginx
fi

# Check for other web servers
if pgrep -f "httpd|apache|nginx" > /dev/null; then
    echo "⚠️  Found web server processes:"
    pgrep -af "httpd|apache|nginx"
    echo "   You may need to stop these manually"
fi

# Check for Hetzner Cloud Console or other services
if systemctl list-units --type=service --state=running | grep -E "cloud|hetzner|webserver"; then
    echo "⚠️  Found potential Hetzner services"
    systemctl list-units --type=service --state=running | grep -E "cloud|hetzner|webserver"
fi

echo ""
echo "After stopping services, verify port 80 is free:"
echo "  ss -tlnp | grep :80"
echo ""
echo "Then retry certbot:"
echo "  sudo certbot certonly --standalone -d your-domain.com"
