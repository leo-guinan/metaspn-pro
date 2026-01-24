#!/bin/bash
set -e

# Database backup script
# This script creates a backup of the PostgreSQL database

# Configuration
BACKUP_DIR="${BACKUP_STORAGE_PATH:-/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_NAME="${POSTGRES_DB:-metaspn}"
DB_USER="${POSTGRES_USER:-metaspn}"
DB_HOST="${POSTGRES_HOST:-postgres}"
BACKUP_FILE="${BACKUP_DIR}/metaspn_backup_${TIMESTAMP}.sql.gz"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "📦 Starting database backup..."

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Check if pg_dump is available
if ! command -v pg_dump &> /dev/null; then
    echo -e "${RED}❌ pg_dump not found. Installing postgresql-client...${NC}"
    apk add --no-cache postgresql-client || apt-get update && apt-get install -y postgresql-client
fi

# Perform backup
echo "💾 Creating backup: ${BACKUP_FILE}..."
if pg_dump -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
    --no-password \
    --format=custom \
    --compress=9 \
    --file="${BACKUP_FILE%.gz}" 2>/dev/null || \
    pg_dump -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
    --no-password \
    --format=plain \
    | gzip > "$BACKUP_FILE"; then
    
    # Verify backup file exists and is not empty
    if [ -f "$BACKUP_FILE" ] && [ -s "$BACKUP_FILE" ]; then
        BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
        echo -e "${GREEN}✅ Backup created successfully: ${BACKUP_FILE} (${BACKUP_SIZE})${NC}"
    else
        echo -e "${RED}❌ Backup file is empty or missing${NC}"
        exit 1
    fi
else
    echo -e "${RED}❌ Backup failed${NC}"
    exit 1
fi

# Clean up old backups
echo "🧹 Cleaning up backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_DIR" -name "metaspn_backup_*.sql.gz" -type f -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name "metaspn_backup_*.sql" -type f -mtime +$RETENTION_DAYS -delete

# List remaining backups
BACKUP_COUNT=$(find "$BACKUP_DIR" -name "metaspn_backup_*" -type f | wc -l)
echo -e "${GREEN}✅ Backup complete. ${BACKUP_COUNT} backup(s) retained.${NC}"

# Optional: Upload to remote storage (uncomment and configure as needed)
# if [ -n "$BACKUP_S3_BUCKET" ]; then
#     echo "☁️  Uploading to S3..."
#     aws s3 cp "$BACKUP_FILE" "s3://${BACKUP_S3_BUCKET}/database-backups/"
# fi
