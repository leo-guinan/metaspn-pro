#!/bin/bash
# Domain debugging script for pro.metaspn.network
# Run this on the server to diagnose domain resolution and Nginx issues

set -e

DOMAIN="pro.metaspn.network"
BACKEND_PORT=3001
FRONTEND_PORT=3000

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🔍 Domain Debugging: ${DOMAIN}${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# 1. DNS Resolution
echo -e "${BLUE}1. DNS Resolution${NC}"
echo "─────────────────────────────────────────"
echo "Checking DNS records for $DOMAIN..."
DNS_RESULT=$(dig +short $DOMAIN A 2>/dev/null || echo "failed")
if [ "$DNS_RESULT" != "failed" ] && [ -n "$DNS_RESULT" ]; then
    echo -e "${GREEN}✅ DNS A record found:${NC}"
    echo "$DNS_RESULT" | while read ip; do
        echo "   → $ip"
    done
else
    echo -e "${RED}❌ DNS A record not found or failed to resolve${NC}"
    echo "   💡 Check your DNS provider settings"
fi

# Check if DNS points to this server
SERVER_IP=$(curl -s ifconfig.me || curl -s icanhazip.com || echo "unknown")
echo ""
echo "Server public IP: $SERVER_IP"
if echo "$DNS_RESULT" | grep -q "$SERVER_IP"; then
    echo -e "${GREEN}✅ DNS points to this server${NC}"
else
    echo -e "${YELLOW}⚠️  DNS does not point to this server's IP${NC}"
    echo "   Expected: $SERVER_IP"
fi
echo ""

# 2. Port Accessibility
echo -e "${BLUE}2. Port Accessibility${NC}"
echo "─────────────────────────────────────────"
for port in 80 443; do
    if netstat -tuln 2>/dev/null | grep -q ":$port " || ss -tuln 2>/dev/null | grep -q ":$port "; then
        echo -e "${GREEN}✅ Port $port is listening${NC}"
    else
        echo -e "${RED}❌ Port $port is NOT listening${NC}"
    fi
done
echo ""

# 3. Nginx Status
echo -e "${BLUE}3. Nginx Status${NC}"
echo "─────────────────────────────────────────"
if docker ps --format "{{.Names}}" | grep -q "nginx\|metaspn-nginx"; then
    echo -e "${GREEN}✅ Nginx container is running${NC}"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "nginx|metaspn-nginx|NAMES" || true
else
    echo -e "${RED}❌ Nginx container is NOT running${NC}"
    echo "   💡 Nginx needs to be started separately or added to docker-compose"
fi
echo ""

# Check if Nginx is installed on host
if command -v nginx &>/dev/null; then
    if systemctl is-active --quiet nginx 2>/dev/null || pgrep nginx > /dev/null; then
        echo -e "${GREEN}✅ Nginx service is running on host${NC}"
        systemctl status nginx --no-pager -l 2>/dev/null | head -5 || true
    else
        echo -e "${YELLOW}⚠️  Nginx is installed but not running on host${NC}"
    fi
else
    echo -e "${YELLOW}ℹ️  Nginx not installed on host (using Docker container)${NC}"
fi
echo ""

# 4. SSL Certificates
echo -e "${BLUE}4. SSL Certificates${NC}"
echo "─────────────────────────────────────────"
CERT_PATHS=(
    "/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
    "/etc/letsencrypt/live/$DOMAIN/privkey.pem"
    "/etc/nginx/ssl/fullchain.pem"
    "/etc/nginx/ssl/privkey.pem"
)

CERT_FOUND=false
for cert_path in "${CERT_PATHS[@]}"; do
    if [ -f "$cert_path" ]; then
        echo -e "${GREEN}✅ Found certificate: $cert_path${NC}"
        if [ -f "$cert_path" ]; then
            CERT_INFO=$(openssl x509 -in "$cert_path" -noout -subject -dates 2>/dev/null || echo "invalid")
            if [ "$CERT_INFO" != "invalid" ]; then
                echo "$CERT_INFO" | sed 's/^/   /'
            fi
        fi
        CERT_FOUND=true
    fi
done

if [ "$CERT_FOUND" = false ]; then
    echo -e "${RED}❌ SSL certificates not found${NC}"
    echo "   💡 Run: sudo certbot certonly --standalone -d $DOMAIN"
fi
echo ""

# 5. Docker Containers Status
echo -e "${BLUE}5. Docker Containers Status${NC}"
echo "─────────────────────────────────────────"
cd /opt/metaspn 2>/dev/null || cd /home/metaspn 2>/dev/null || true
if [ -f docker-compose.prod.yml ]; then
    echo "Container status:"
    docker compose -f docker-compose.prod.yml ps 2>/dev/null || docker-compose -f docker-compose.prod.yml ps 2>/dev/null || echo "Could not check container status"
else
    echo -e "${YELLOW}⚠️  docker-compose.prod.yml not found in current directory${NC}"
fi
echo ""

# 6. Service Health Checks
echo -e "${BLUE}6. Service Health Checks${NC}"
echo "─────────────────────────────────────────"

# Backend health
echo "Checking backend (localhost:$BACKEND_PORT)..."
if curl -s -f -m 5 "http://localhost:$BACKEND_PORT/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Backend is responding on port $BACKEND_PORT${NC}"
    BACKEND_HEALTH=$(curl -s "http://localhost:$BACKEND_PORT/health" 2>/dev/null || echo "failed")
    echo "   Response: $BACKEND_HEALTH"
else
    echo -e "${RED}❌ Backend is NOT responding on port $BACKEND_PORT${NC}"
    echo "   💡 Check backend container logs: docker compose -f docker-compose.prod.yml logs backend"
fi

# Frontend health
echo ""
echo "Checking frontend (localhost:$FRONTEND_PORT)..."
if curl -s -f -m 5 "http://localhost:$FRONTEND_PORT" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Frontend is responding on port $FRONTEND_PORT${NC}"
else
    echo -e "${RED}❌ Frontend is NOT responding on port $FRONTEND_PORT${NC}"
    echo "   💡 Check frontend container logs: docker compose -f docker-compose.prod.yml logs frontend"
fi
echo ""

# 7. Nginx Configuration
echo -e "${BLUE}7. Nginx Configuration${NC}"
echo "─────────────────────────────────────────"
NGINX_CONF_PATHS=(
    "/opt/metaspn/nginx/conf.d/metaspn.conf"
    "/etc/nginx/sites-available/metaspn"
    "/etc/nginx/conf.d/metaspn.conf"
)

NGINX_CONF_FOUND=false
for conf_path in "${NGINX_CONF_PATHS[@]}"; do
    if [ -f "$conf_path" ]; then
        echo -e "${GREEN}✅ Found Nginx config: $conf_path${NC}"
        # Check if domain is configured
        if grep -q "$DOMAIN" "$conf_path" 2>/dev/null; then
            echo -e "${GREEN}   ✅ Domain $DOMAIN is configured${NC}"
        else
            echo -e "${YELLOW}   ⚠️  Domain $DOMAIN not found in config${NC}"
            echo "   💡 Update server_name directive to include $DOMAIN"
        fi
        NGINX_CONF_FOUND=true
    fi
done

if [ "$NGINX_CONF_FOUND" = false ]; then
    echo -e "${RED}❌ Nginx configuration not found${NC}"
    echo "   💡 Check nginx/conf.d/metaspn.conf in the repository"
fi
echo ""

# 8. Firewall Status
echo -e "${BLUE}8. Firewall Status${NC}"
echo "─────────────────────────────────────────"
if command -v ufw &>/dev/null; then
    UFW_STATUS=$(sudo ufw status 2>/dev/null | head -1 || echo "unknown")
    echo "UFW Status: $UFW_STATUS"
    if echo "$UFW_STATUS" | grep -q "active"; then
        echo "Open ports:"
        sudo ufw status numbered 2>/dev/null | grep -E "80|443|22" || echo "   (check manually)"
    fi
else
    echo -e "${YELLOW}ℹ️  UFW not installed${NC}"
fi
echo ""

# 9. Network Connectivity Test
echo -e "${BLUE}9. Network Connectivity Test${NC}"
echo "─────────────────────────────────────────"
echo "Testing external connectivity to $DOMAIN..."
if curl -s -f -m 10 "http://$DOMAIN" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ HTTP connection successful${NC}"
elif curl -s -f -m 10 "https://$DOMAIN" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ HTTPS connection successful${NC}"
else
    echo -e "${RED}❌ Cannot connect to $DOMAIN${NC}"
    echo "   Testing from this server..."
    if curl -s -f -m 5 "http://localhost" > /dev/null 2>&1 || curl -s -f -m 5 "http://127.0.0.1" > /dev/null 2>&1; then
        echo -e "${YELLOW}   ⚠️  Services respond locally but not externally${NC}"
        echo "   💡 Check: DNS, firewall, port forwarding"
    fi
fi
echo ""

# 10. Summary and Recommendations
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📋 Summary & Recommendations${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

ISSUES=0

# Check critical issues
if [ "$DNS_RESULT" = "failed" ] || [ -z "$DNS_RESULT" ]; then
    echo -e "${RED}❌ CRITICAL: DNS not configured${NC}"
    echo "   Fix: Configure A record for $DOMAIN → $SERVER_IP"
    ISSUES=$((ISSUES + 1))
fi

if ! docker ps --format "{{.Names}}" | grep -q "nginx\|metaspn-nginx"; then
    if ! systemctl is-active --quiet nginx 2>/dev/null && ! pgrep nginx > /dev/null; then
        echo -e "${RED}❌ CRITICAL: Nginx not running${NC}"
        echo "   Fix: Start Nginx container or install/start Nginx service"
        ISSUES=$((ISSUES + 1))
    fi
fi

if [ "$CERT_FOUND" = false ]; then
    echo -e "${YELLOW}⚠️  WARNING: SSL certificates not found${NC}"
    echo "   Fix: Run: sudo certbot certonly --standalone -d $DOMAIN"
    ISSUES=$((ISSUES + 1))
fi

if [ $ISSUES -eq 0 ]; then
    echo -e "${GREEN}✅ All critical checks passed!${NC}"
    echo ""
    echo "If domain still doesn't work, check:"
    echo "  1. Nginx configuration has correct server_name"
    echo "  2. Nginx is listening on ports 80 and 443"
    echo "  3. Firewall allows ports 80 and 443"
    echo "  4. DNS propagation (can take up to 48 hours)"
else
    echo -e "${RED}❌ Found $ISSUES critical issue(s)${NC}"
fi

echo ""
echo "For detailed logs:"
echo "  - Nginx: docker logs metaspn-nginx (or /var/log/nginx/error.log)"
echo "  - Backend: docker compose -f docker-compose.prod.yml logs backend"
echo "  - Frontend: docker compose -f docker-compose.prod.yml logs frontend"
