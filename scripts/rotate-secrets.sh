#!/bin/bash
set -e

# Secret rotation script
# This script helps rotate secrets in production

ENV_FILE="${ENV_FILE:-/etc/metaspn/.env.prod}"
BACKUP_DIR="/etc/metaspn/secrets-backup"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup current secrets
echo "📦 Backing up current secrets..."
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
cp "$ENV_FILE" "$BACKUP_DIR/.env.prod.backup.$TIMESTAMP"
chmod 600 "$BACKUP_DIR/.env.prod.backup.$TIMESTAMP"

# Function to generate secure random string
generate_secret() {
    local length=${1:-32}
    openssl rand -hex "$length"
}

# Function to rotate a secret
rotate_secret() {
    local secret_name=$1
    local length=${2:-32}
    
    echo "🔄 Rotating $secret_name..."
    
    # Generate new secret
    local new_secret=$(generate_secret "$length")
    
    # Update in env file
    if grep -q "^${secret_name}=" "$ENV_FILE"; then
        sed -i "s|^${secret_name}=.*|${secret_name}=${new_secret}|" "$ENV_FILE"
        echo "✅ $secret_name rotated"
    else
        echo "$secret_name=$new_secret" >> "$ENV_FILE"
        echo "✅ $secret_name added"
    fi
}

# Main rotation logic
if [ "$1" = "all" ]; then
    echo "🔄 Rotating all secrets..."
    rotate_secret "JWT_SECRET" 64
    rotate_secret "NEXTAUTH_SECRET" 64
    rotate_secret "GITHUB_TOKEN_ENCRYPTION_KEY" 32
    rotate_secret "POSTGRES_PASSWORD" 32
elif [ -n "$1" ]; then
    # Rotate specific secret
    case "$1" in
        jwt)
            rotate_secret "JWT_SECRET" 64
            ;;
        nextauth)
            rotate_secret "NEXTAUTH_SECRET" 64
            ;;
        github-key)
            rotate_secret "GITHUB_TOKEN_ENCRYPTION_KEY" 32
            ;;
        db-password)
            rotate_secret "POSTGRES_PASSWORD" 32
            echo "⚠️  Remember to update database password manually!"
            ;;
        *)
            echo "Unknown secret: $1"
            echo "Usage: $0 [all|jwt|nextauth|github-key|db-password]"
            exit 1
            ;;
    esac
else
    echo "Usage: $0 [all|jwt|nextauth|github-key|db-password]"
    exit 1
fi

# Secure the env file
chmod 600 "$ENV_FILE"

echo "✅ Secret rotation complete!"
echo "⚠️  Remember to restart services after rotating secrets:"
echo "   docker compose -f /opt/metaspn/docker-compose.prod.yml restart"
