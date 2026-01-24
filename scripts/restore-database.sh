#!/bin/bash
set -e

# Database restoration script
# This script restores a PostgreSQL database from a backup

# Configuration
BACKUP_DIR="${BACKUP_STORAGE_PATH:-/backups}"
DB_NAME="${POSTGRES_DB:-metaspn}"
DB_USER="${POSTGRES_USER:-metaspn}"
DB_HOST="${POSTGRES_HOST:-postgres}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if backup file is provided
if [ -z "$1" ]; then
    echo -e "${RED}❌ Usage: $0 <backup_file>${NC}"
    echo ""
    echo "Available backups:"
    ls -lh "$BACKUP_DIR"/metaspn_backup_* 2>/dev/null || echo "No backups found"
    exit 1
fi

BACKUP_FILE="$1"

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    echo -e "${RED}❌ Backup file not found: ${BACKUP_FILE}${NC}"
    exit 1
fi

# Confirm restoration
echo -e "${YELLOW}⚠️  WARNING: This will replace the current database!${NC}"
echo -e "${YELLOW}Database: ${DB_NAME}${NC}"
echo -e "${YELLOW}Backup file: ${BACKUP_FILE}${NC}"
read -p "Are you sure you want to continue? (type 'yes' to confirm): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Restoration cancelled."
    exit 0
fi

# Check if psql is available
if ! command -v psql &> /dev/null && ! command -v pg_restore &> /dev/null; then
    echo -e "${RED}❌ PostgreSQL client tools not found. Installing...${NC}"
    apk add --no-cache postgresql-client || apt-get update && apt-get install -y postgresql-client
fi

echo "🔄 Restoring database from backup..."

# Determine backup format and restore accordingly
if [[ "$BACKUP_FILE" == *.gz ]]; then
    # Compressed SQL dump
    echo "📦 Decompressing and restoring..."
    gunzip -c "$BACKUP_FILE" | psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" --no-password
elif [[ "$BACKUP_FILE" == *.sql ]]; then
    # Plain SQL dump
    echo "📦 Restoring SQL dump..."
    psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" --no-password < "$BACKUP_FILE"
elif file "$BACKUP_FILE" | grep -q "PostgreSQL custom database dump"; then
    # Custom format dump
    echo "📦 Restoring custom format dump..."
    pg_restore -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" --no-password --clean --if-exists "$BACKUP_FILE"
else
    echo -e "${RED}❌ Unknown backup format${NC}"
    exit 1
fi

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Database restored successfully${NC}"
else
    echo -e "${RED}❌ Database restoration failed${NC}"
    exit 1
fi
