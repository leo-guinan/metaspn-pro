#!/bin/bash
set -e

# Pre-deployment secret validation script
# This script validates that all required secrets are present and properly formatted

ENV_FILE="${ENV_FILE:-/etc/metaspn/.env.prod}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0
WARNINGS=0

echo "🔍 Validating production secrets..."

# Check if file exists
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}❌ Secrets file not found: ${ENV_FILE}${NC}"
    exit 1
fi

# Check file permissions
PERMS=$(stat -c "%a" "$ENV_FILE")
if [ "$PERMS" != "600" ]; then
    echo -e "${YELLOW}⚠️  Warning: Secrets file should have 600 permissions (current: ${PERMS})${NC}"
    ((WARNINGS++))
fi

# Required secrets
REQUIRED_SECRETS=(
    "POSTGRES_PASSWORD"
    "JWT_SECRET"
    "NEXTAUTH_SECRET"
    "GITHUB_TOKEN_ENCRYPTION_KEY"
    "OPENAI_API_KEY"
    "ANTHROPIC_API_KEY"
    "TWITTER_CLIENT_ID"
    "TWITTER_CLIENT_SECRET"
    "GITHUB_CLIENT_ID"
    "GITHUB_CLIENT_SECRET"
    "FRONTEND_URL"
    "NEXT_PUBLIC_API_URL"
    "NEXTAUTH_URL"
)

# Check each required secret
for secret in "${REQUIRED_SECRETS[@]}"; do
    if ! grep -q "^${secret}=" "$ENV_FILE"; then
        echo -e "${RED}❌ Missing required secret: ${secret}${NC}"
        ((ERRORS++))
    else
        value=$(grep "^${secret}=" "$ENV_FILE" | cut -d '=' -f2-)
        if [ -z "$value" ] || [ "$value" = "CHANGE_ME"* ] || [ "$value" = "your_*" ]; then
            echo -e "${RED}❌ Invalid or placeholder value for: ${secret}${NC}"
            ((ERRORS++))
        else
            echo -e "${GREEN}✅ ${secret} is set${NC}"
        fi
    fi
done

# Validate secret lengths
echo ""
echo "🔍 Validating secret strength..."

if grep -q "^JWT_SECRET=" "$ENV_FILE"; then
    jwt_secret=$(grep "^JWT_SECRET=" "$ENV_FILE" | cut -d '=' -f2-)
    if [ ${#jwt_secret} -lt 32 ]; then
        echo -e "${YELLOW}⚠️  Warning: JWT_SECRET should be at least 32 characters (current: ${#jwt_secret})${NC}"
        ((WARNINGS++))
    fi
fi

if grep -q "^NEXTAUTH_SECRET=" "$ENV_FILE"; then
    nextauth_secret=$(grep "^NEXTAUTH_SECRET=" "$ENV_FILE" | cut -d '=' -f2-)
    if [ ${#nextauth_secret} -lt 32 ]; then
        echo -e "${YELLOW}⚠️  Warning: NEXTAUTH_SECRET should be at least 32 characters (current: ${#nextauth_secret})${NC}"
        ((WARNINGS++))
    fi
fi

# Validate URLs
if grep -q "^FRONTEND_URL=" "$ENV_FILE"; then
    frontend_url=$(grep "^FRONTEND_URL=" "$ENV_FILE" | cut -d '=' -f2-)
    if [[ ! "$frontend_url" =~ ^https:// ]]; then
        echo -e "${YELLOW}⚠️  Warning: FRONTEND_URL should use HTTPS in production${NC}"
        ((WARNINGS++))
    fi
fi

if grep -q "^NEXTAUTH_URL=" "$ENV_FILE"; then
    nextauth_url=$(grep "^NEXTAUTH_URL=" "$ENV_FILE" | cut -d '=' -f2-)
    if [[ ! "$nextauth_url" =~ ^https:// ]]; then
        echo -e "${YELLOW}⚠️  Warning: NEXTAUTH_URL should use HTTPS in production${NC}"
        ((WARNINGS++))
    fi
fi

# Summary
echo ""
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✅ All secrets validated successfully!${NC}"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠️  Validation completed with ${WARNINGS} warning(s)${NC}"
    exit 0
else
    echo -e "${RED}❌ Validation failed with ${ERRORS} error(s) and ${WARNINGS} warning(s)${NC}"
    exit 1
fi
