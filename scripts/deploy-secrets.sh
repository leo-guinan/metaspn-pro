#!/bin/bash
set -e

# Secure secret deployment script
# This script helps deploy secrets from GitHub Secrets or local secure storage to the server

ENV_FILE="${ENV_FILE:-/etc/metaspn/.env.prod}"
TEMP_FILE=$(mktemp)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🔐 Deploying secrets to production...${NC}"

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}❌ This script must be run as root or with sudo${NC}"
    exit 1
fi

# Create directory if it doesn't exist
mkdir -p "$(dirname "$ENV_FILE")"

# Function to read secret from stdin or prompt
read_secret() {
    local var_name=$1
    local description=$2
    local current_value=""
    
    if [ -f "$ENV_FILE" ] && grep -q "^${var_name}=" "$ENV_FILE"; then
        current_value=$(grep "^${var_name}=" "$ENV_FILE" | cut -d '=' -f2-)
    fi
    
    if [ -n "$current_value" ]; then
        echo -e "${YELLOW}Current value for ${var_name} exists. Press Enter to keep it, or type new value:${NC}"
        read -s new_value
        if [ -z "$new_value" ]; then
            echo "$var_name=$current_value" >> "$TEMP_FILE"
            return
        fi
    else
        echo -e "${YELLOW}Enter ${description} (${var_name}):${NC}"
        read -s new_value
    fi
    
    if [ -z "$new_value" ]; then
        echo -e "${RED}❌ ${var_name} cannot be empty${NC}"
        exit 1
    fi
    
    echo "$var_name=$new_value" >> "$TEMP_FILE"
}

# Backup existing file
if [ -f "$ENV_FILE" ]; then
    echo "📦 Backing up existing secrets..."
    cp "$ENV_FILE" "${ENV_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
fi

# Read secrets interactively or from environment
if [ "$1" = "--non-interactive" ]; then
    # Non-interactive mode: read from environment variables
    echo "Reading secrets from environment variables..."
    
    # Required secrets
    for var in POSTGRES_PASSWORD JWT_SECRET NEXTAUTH_SECRET GITHUB_TOKEN_ENCRYPTION_KEY; do
        if [ -z "${!var}" ]; then
            echo -e "${RED}❌ Missing required environment variable: $var${NC}"
            exit 1
        fi
        echo "$var=${!var}" >> "$TEMP_FILE"
    done
    
    # Optional secrets (with defaults from existing file)
    for var in OPENAI_API_KEY ANTHROPIC_API_KEY TWITTER_CLIENT_ID TWITTER_CLIENT_SECRET \
               GITHUB_CLIENT_ID GITHUB_CLIENT_SECRET POSTGRES_USER POSTGRES_DB; do
        if [ -n "${!var}" ]; then
            echo "$var=${!var}" >> "$TEMP_FILE"
        elif [ -f "$ENV_FILE" ] && grep -q "^${var}=" "$ENV_FILE"; then
            grep "^${var}=" "$ENV_FILE" >> "$TEMP_FILE"
        fi
    done
else
    # Interactive mode
    echo "Enter production secrets (input will be hidden):"
    echo ""
    
    read_secret "POSTGRES_PASSWORD" "Database password"
    read_secret "JWT_SECRET" "JWT secret (64+ characters recommended)"
    read_secret "NEXTAUTH_SECRET" "NextAuth secret (64+ characters recommended)"
    read_secret "GITHUB_TOKEN_ENCRYPTION_KEY" "GitHub token encryption key"
    read_secret "OPENAI_API_KEY" "OpenAI API key"
    read_secret "ANTHROPIC_API_KEY" "Anthropic API key"
    read_secret "TWITTER_CLIENT_ID" "Twitter OAuth client ID"
    read_secret "TWITTER_CLIENT_SECRET" "Twitter OAuth client secret"
    read_secret "GITHUB_CLIENT_ID" "GitHub OAuth client ID"
    read_secret "GITHUB_CLIENT_SECRET" "GitHub OAuth client secret"
    
    # Optional with defaults
    echo -e "${YELLOW}Enter POSTGRES_USER (default: metaspn):${NC}"
    read postgres_user
    echo "POSTGRES_USER=${postgres_user:-metaspn}" >> "$TEMP_FILE"
    
    echo -e "${YELLOW}Enter POSTGRES_DB (default: metaspn):${NC}"
    read postgres_db
    echo "POSTGRES_DB=${postgres_db:-metaspn}" >> "$TEMP_FILE"
fi

# Write to production file
mv "$TEMP_FILE" "$ENV_FILE"
chmod 600 "$ENV_FILE"
chown root:root "$ENV_FILE"

echo -e "${GREEN}✅ Secrets deployed successfully to ${ENV_FILE}${NC}"
echo -e "${YELLOW}⚠️  Remember to restart services after deploying secrets${NC}"
