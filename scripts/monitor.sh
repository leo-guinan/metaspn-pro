#!/bin/bash
set -e

# Monitoring script
# This script monitors system resources and application health

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "📊 System Monitoring Report"
echo "=========================="
echo ""

# CPU Usage
CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1}')
echo -e "${BLUE}CPU Usage:${NC} ${CPU_USAGE}%"
if (( $(echo "$CPU_USAGE > 80" | bc -l) )); then
    echo -e "${YELLOW}⚠️  High CPU usage detected${NC}"
fi

# Memory Usage
MEM_INFO=$(free -h | awk '/^Mem:/ {print $3 "/" $2}')
MEM_PERCENT=$(free | awk '/^Mem:/ {printf "%.0f", $3/$2 * 100}')
echo -e "${BLUE}Memory Usage:${NC} ${MEM_INFO} (${MEM_PERCENT}%)"
if [ "$MEM_PERCENT" -gt 80 ]; then
    echo -e "${YELLOW}⚠️  High memory usage detected${NC}"
fi

# Disk Usage
DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
DISK_AVAIL=$(df -h / | awk 'NR==2 {print $4}')
echo -e "${BLUE}Disk Usage:${NC} ${DISK_USAGE}% used (${DISK_AVAIL} available)"
if [ "$DISK_USAGE" -gt 80 ]; then
    echo -e "${RED}⚠️  Low disk space!${NC}"
fi

# Docker Containers
echo ""
echo -e "${BLUE}Docker Containers:${NC}"
if docker ps --format "table {{.Names}}\t{{.Status}}" | grep -q "metaspn"; then
    docker ps --format "table {{.Names}}\t{{.Status}}" | grep "metaspn"
else
    echo -e "${RED}❌ No MetaSPN containers running${NC}"
fi

# Container Health
echo ""
echo -e "${BLUE}Container Health:${NC}"
for container in metaspn-backend-prod metaspn-frontend-prod metaspn-postgres-prod metaspn-worker-prod; do
    if docker ps --format "{{.Names}}" | grep -q "^${container}$"; then
        HEALTH=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "no-healthcheck")
        STATUS=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null)
        if [ "$STATUS" = "running" ]; then
            if [ "$HEALTH" = "healthy" ]; then
                echo -e "${GREEN}✅ ${container}: ${STATUS} (${HEALTH})${NC}"
            elif [ "$HEALTH" = "no-healthcheck" ]; then
                echo -e "${YELLOW}⚠️  ${container}: ${STATUS} (no healthcheck)${NC}"
            else
                echo -e "${RED}❌ ${container}: ${STATUS} (${HEALTH})${NC}"
            fi
        else
            echo -e "${RED}❌ ${container}: ${STATUS}${NC}"
        fi
    else
        echo -e "${RED}❌ ${container}: not running${NC}"
    fi
done

# Application Health Endpoints
echo ""
echo -e "${BLUE}Application Health:${NC}"
if curl -f -s http://localhost:3001/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Backend health check: OK${NC}"
else
    echo -e "${RED}❌ Backend health check: FAILED${NC}"
fi

if curl -f -s http://localhost:3000 > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Frontend health check: OK${NC}"
else
    echo -e "${RED}❌ Frontend health check: FAILED${NC}"
fi

# Database Connection
echo ""
echo -e "${BLUE}Database:${NC}"
if docker exec metaspn-postgres-prod pg_isready -U metaspn > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Database connection: OK${NC}"
    
    # Check database size
    DB_SIZE=$(docker exec metaspn-postgres-prod psql -U metaspn -d metaspn -tAc "SELECT pg_size_pretty(pg_database_size('metaspn'));" 2>/dev/null || echo "unknown")
    echo -e "${BLUE}  Database size: ${DB_SIZE}${NC}"
else
    echo -e "${RED}❌ Database connection: FAILED${NC}"
fi

# Recent Logs (last 5 errors)
echo ""
echo -e "${BLUE}Recent Errors (last 5):${NC}"
docker logs --tail 100 metaspn-backend-prod 2>&1 | grep -i error | tail -5 || echo "No recent errors"
docker logs --tail 100 metaspn-frontend-prod 2>&1 | grep -i error | tail -5 || echo "No recent errors"

# Network Connections
echo ""
echo -e "${BLUE}Network Connections:${NC}"
NETSTAT=$(netstat -tuln | grep -E ':(3000|3001|5432|80|443)' | wc -l)
echo "Active connections on application ports: $NETSTAT"

echo ""
echo "=========================="
echo "Monitoring complete"
