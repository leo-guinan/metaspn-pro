#!/bin/bash
# Script to check deployment user permissions before deployment
# Run this on the server to verify the deployment user can access required resources

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔍 Checking deployment user permissions...${NC}"
echo ""

# Get the deployment user (from GitHub Actions secret PRODUCTION_USER)
# Default to checking current user if not specified
DEPLOY_USER="${1:-$(whoami)}"

echo -e "${YELLOW}Checking permissions for user: ${DEPLOY_USER}${NC}"
echo ""

# Check 1: Verify user exists
echo -e "${BLUE}1. Checking if user exists...${NC}"
if id "$DEPLOY_USER" &>/dev/null; then
    echo -e "${GREEN}✅ User $DEPLOY_USER exists${NC}"
    echo "   User ID: $(id -u "$DEPLOY_USER")"
    echo "   Group ID: $(id -g "$DEPLOY_USER")"
    echo "   Groups: $(id -Gn "$DEPLOY_USER")"
else
    echo -e "${RED}❌ User $DEPLOY_USER does not exist${NC}"
    exit 1
fi
echo ""

# Check 2: Verify sudo access
echo -e "${BLUE}2. Checking sudo permissions...${NC}"
if sudo -n -l -U "$DEPLOY_USER" &>/dev/null; then
    echo -e "${GREEN}✅ User $DEPLOY_USER has sudo access${NC}"
    echo "   Sudo permissions:"
    sudo -l -U "$DEPLOY_USER" | grep -v "may run" || sudo -l -U "$DEPLOY_USER"
    
    # Test if they can run commands without password
    if sudo -n true 2>/dev/null; then
        echo -e "${GREEN}   ✅ Can run sudo commands without password prompt${NC}"
    else
        echo -e "${YELLOW}   ⚠️  Requires password for sudo commands${NC}"
    fi
else
    echo -e "${RED}❌ User $DEPLOY_USER does NOT have sudo access${NC}"
    echo -e "${YELLOW}   This may cause issues if .env file is in /etc/metaspn/.env.prod${NC}"
fi
echo ""

# Check 3: Verify .env file locations
echo -e "${BLUE}3. Checking .env file locations...${NC}"

# Check /etc/metaspn/.env.prod
if [ -f /etc/metaspn/.env.prod ]; then
    echo -e "${GREEN}✅ Found /etc/metaspn/.env.prod${NC}"
    echo "   Owner: $(stat -c '%U:%G' /etc/metaspn/.env.prod)"
    echo "   Permissions: $(stat -c '%a' /etc/metaspn/.env.prod)"
    
    # Check if deployment user can read it
    if sudo -u "$DEPLOY_USER" test -r /etc/metaspn/.env.prod 2>/dev/null; then
        echo -e "${GREEN}   ✅ User $DEPLOY_USER can READ this file${NC}"
    else
        echo -e "${YELLOW}   ⚠️  User $DEPLOY_USER CANNOT read this file${NC}"
        echo -e "${YELLOW}   💡 Will need sudo to copy it during deployment${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  /etc/metaspn/.env.prod not found${NC}"
fi

# Check /opt/metaspn/.env
if [ -f /opt/metaspn/.env ]; then
    echo -e "${GREEN}✅ Found /opt/metaspn/.env${NC}"
    echo "   Owner: $(stat -c '%U:%G' /opt/metaspn/.env)"
    echo "   Permissions: $(stat -c '%a' /opt/metaspn/.env)"
    
    # Check if deployment user can read it
    if sudo -u "$DEPLOY_USER" test -r /opt/metaspn/.env 2>/dev/null; then
        echo -e "${GREEN}   ✅ User $DEPLOY_USER can READ this file${NC}"
    else
        echo -e "${RED}   ❌ User $DEPLOY_USER CANNOT read this file${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  /opt/metaspn/.env not found${NC}"
fi
echo ""

# Check 4: Verify /opt/metaspn directory permissions
echo -e "${BLUE}4. Checking /opt/metaspn directory permissions...${NC}"
if [ -d /opt/metaspn ]; then
    echo -e "${GREEN}✅ /opt/metaspn directory exists${NC}"
    echo "   Owner: $(stat -c '%U:%G' /opt/metaspn)"
    echo "   Permissions: $(stat -c '%a' /opt/metaspn)"
    
    # Check if deployment user can write to it
    if sudo -u "$DEPLOY_USER" test -w /opt/metaspn 2>/dev/null; then
        echo -e "${GREEN}   ✅ User $DEPLOY_USER can WRITE to this directory${NC}"
    else
        echo -e "${YELLOW}   ⚠️  User $DEPLOY_USER CANNOT write to this directory${NC}"
        echo -e "${YELLOW}   💡 May need sudo to copy .env file here${NC}"
    fi
else
    echo -e "${RED}❌ /opt/metaspn directory does not exist${NC}"
fi
echo ""

# Check 5: Test copying .env file (if /etc version exists)
echo -e "${BLUE}5. Testing .env file copy operation...${NC}"
if [ -f /etc/metaspn/.env.prod ]; then
    if sudo -u "$DEPLOY_USER" test -r /etc/metaspn/.env.prod 2>/dev/null; then
        echo -e "${GREEN}✅ Can read /etc/metaspn/.env.prod directly - no copy needed${NC}"
    else
        # Test if we can copy it with sudo
        TEST_COPY="/tmp/.env.test.copy"
        if sudo cp /etc/metaspn/.env.prod "$TEST_COPY" 2>/dev/null && \
           sudo chown "$DEPLOY_USER:$DEPLOY_USER" "$TEST_COPY" 2>/dev/null && \
           sudo chmod 600 "$TEST_COPY" 2>/dev/null; then
            echo -e "${GREEN}✅ Can copy .env file with sudo${NC}"
            sudo rm -f "$TEST_COPY"
        else
            echo -e "${RED}❌ Cannot copy .env file - sudo may not have required permissions${NC}"
            echo -e "${YELLOW}   💡 Recommendation: Manually copy /etc/metaspn/.env.prod to /opt/metaspn/.env${NC}"
            echo -e "${YELLOW}      sudo cp /etc/metaspn/.env.prod /opt/metaspn/.env${NC}"
            echo -e "${YELLOW}      sudo chown $DEPLOY_USER:$DEPLOY_USER /opt/metaspn/.env${NC}"
            echo -e "${YELLOW}      sudo chmod 600 /opt/metaspn/.env${NC}"
        fi
    fi
else
    echo -e "${YELLOW}⚠️  Skipping copy test - /etc/metaspn/.env.prod not found${NC}"
fi
echo ""

# Check 6: Verify Docker access
echo -e "${BLUE}6. Checking Docker access...${NC}"
if sudo -u "$DEPLOY_USER" docker ps &>/dev/null; then
    echo -e "${GREEN}✅ User $DEPLOY_USER can run Docker commands${NC}"
    echo "   Docker version: $(sudo -u "$DEPLOY_USER" docker --version 2>/dev/null || echo 'unknown')"
else
    echo -e "${RED}❌ User $DEPLOY_USER CANNOT run Docker commands${NC}"
    echo -e "${YELLOW}   💡 Add user to docker group: sudo usermod -aG docker $DEPLOY_USER${NC}"
fi
echo ""

# Check 7: Verify docker compose access
echo -e "${BLUE}7. Checking Docker Compose access...${NC}"
if sudo -u "$DEPLOY_USER" docker compose version &>/dev/null; then
    echo -e "${GREEN}✅ User $DEPLOY_USER can run Docker Compose commands${NC}"
    echo "   Docker Compose version: $(sudo -u "$DEPLOY_USER" docker compose version 2>/dev/null | head -1)"
else
    echo -e "${RED}❌ User $DEPLOY_USER CANNOT run Docker Compose commands${NC}"
fi
echo ""

# Summary
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📋 Summary${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

ISSUES=0

# Check critical requirements
if ! sudo -u "$DEPLOY_USER" docker ps &>/dev/null; then
    echo -e "${RED}❌ CRITICAL: Cannot run Docker commands${NC}"
    ISSUES=$((ISSUES + 1))
fi

if [ -f /etc/metaspn/.env.prod ]; then
    if ! sudo -u "$DEPLOY_USER" test -r /etc/metaspn/.env.prod 2>/dev/null; then
        if ! sudo -n true 2>/dev/null; then
            echo -e "${RED}❌ CRITICAL: Cannot read .env file and no sudo access${NC}"
            ISSUES=$((ISSUES + 1))
        else
            echo -e "${YELLOW}⚠️  WARNING: Cannot read .env file, but has sudo access${NC}"
        fi
    fi
elif [ ! -f /opt/metaspn/.env ]; then
    echo -e "${RED}❌ CRITICAL: No .env file found in either location${NC}"
    ISSUES=$((ISSUES + 1))
fi

if [ $ISSUES -eq 0 ]; then
    echo -e "${GREEN}✅ All critical checks passed! Deployment should work.${NC}"
    exit 0
else
    echo -e "${RED}❌ Found $ISSUES critical issue(s). Please fix before deploying.${NC}"
    exit 1
fi
