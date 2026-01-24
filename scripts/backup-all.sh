#!/bin/bash
set -e

# Complete backup script
# This script backs up database, configuration, and SSL certificates

BACKUP_DIR="${BACKUP_STORAGE_PATH:-/backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_ROOT="${BACKUP_DIR}/full_backup_${TIMESTAMP}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "📦 Starting complete backup..."

# Create backup directory
mkdir -p "$BACKUP_ROOT"

# Backup database
echo "💾 Backing up database..."
if [ -f "/opt/metaspn/scripts/backup-database.sh" ]; then
    /opt/metaspn/scripts/backup-database.sh
    # Copy latest database backup
    LATEST_DB_BACKUP=$(ls -t "${BACKUP_DIR}"/metaspn_backup_*.sql.gz 2>/dev/null | head -1)
    if [ -n "$LATEST_DB_BACKUP" ]; then
        cp "$LATEST_DB_BACKUP" "$BACKUP_ROOT/"
    fi
fi

# Backup configuration (encrypted)
echo "🔐 Backing up configuration..."
if [ -f "/etc/metaspn/.env.prod" ]; then
    mkdir -p "$BACKUP_ROOT/config"
    # Encrypt the config file before backing up
    if command -v gpg &> /dev/null; then
        gpg --symmetric --cipher-algo AES256 --output "$BACKUP_ROOT/config/.env.prod.gpg" /etc/metaspn/.env.prod
        echo -e "${GREEN}✅ Configuration backed up (encrypted)${NC}"
    else
        cp /etc/metaspn/.env.prod "$BACKUP_ROOT/config/.env.prod"
        chmod 600 "$BACKUP_ROOT/config/.env.prod"
        echo -e "${YELLOW}⚠️  Configuration backed up (not encrypted - install GPG for encryption)${NC}"
    fi
fi

# Backup SSL certificates
echo "🔒 Backing up SSL certificates..."
if [ -d "/etc/nginx/ssl" ]; then
    mkdir -p "$BACKUP_ROOT/ssl"
    cp -r /etc/nginx/ssl/* "$BACKUP_ROOT/ssl/" 2>/dev/null || true
    echo -e "${GREEN}✅ SSL certificates backed up${NC}"
fi

# Backup docker-compose configuration
echo "🐳 Backing up Docker configuration..."
if [ -f "/opt/metaspn/docker-compose.prod.yml" ]; then
    mkdir -p "$BACKUP_ROOT/docker"
    cp /opt/metaspn/docker-compose.prod.yml "$BACKUP_ROOT/docker/"
    echo -e "${GREEN}✅ Docker configuration backed up${NC}"
fi

# Create backup manifest
cat > "$BACKUP_ROOT/manifest.txt" <<EOF
Backup created: $(date)
Hostname: $(hostname)
Database: ${POSTGRES_DB:-metaspn}
Backup type: Full backup
EOF

# Compress backup
echo "📦 Compressing backup..."
cd "$BACKUP_DIR"
tar -czf "full_backup_${TIMESTAMP}.tar.gz" "full_backup_${TIMESTAMP}"
rm -rf "full_backup_${TIMESTAMP}"

BACKUP_SIZE=$(du -h "full_backup_${TIMESTAMP}.tar.gz" | cut -f1)
echo -e "${GREEN}✅ Complete backup created: full_backup_${TIMESTAMP}.tar.gz (${BACKUP_SIZE})${NC}"
