#!/bin/bash
set -e

# Database migration runner script
# This script runs database migrations in production

# Configuration
MIGRATIONS_DIR="${MIGRATIONS_DIR:-/opt/metaspn/database/migrations}"
DB_NAME="${POSTGRES_DB:-metaspn}"
DB_USER="${POSTGRES_USER:-metaspn}"
DB_HOST="${POSTGRES_HOST:-postgres}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔄 Running database migrations..."

# Check if migrations directory exists
if [ ! -d "$MIGRATIONS_DIR" ]; then
    echo -e "${RED}❌ Migrations directory not found: ${MIGRATIONS_DIR}${NC}"
    exit 1
fi

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo -e "${RED}❌ psql not found. Installing postgresql-client...${NC}"
    apk add --no-cache postgresql-client || apt-get update && apt-get install -y postgresql-client
fi

# Create migrations tracking table if it doesn't exist
echo "📋 Setting up migrations tracking..."
psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" --no-password <<EOF
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
EOF

# Get list of migration files
MIGRATION_FILES=$(ls -1 "$MIGRATIONS_DIR"/*.sql 2>/dev/null | sort)

if [ -z "$MIGRATION_FILES" ]; then
    echo -e "${YELLOW}⚠️  No migration files found${NC}"
    exit 0
fi

# Run each migration
SUCCESS_COUNT=0
FAILED_COUNT=0

for migration_file in $MIGRATION_FILES; do
    VERSION=$(basename "$migration_file" .sql)
    
    # Check if migration has already been applied
    if psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" --no-password -tAc \
        "SELECT 1 FROM schema_migrations WHERE version='$VERSION'" | grep -q 1; then
        echo -e "${YELLOW}⏭️  Skipping already applied migration: ${VERSION}${NC}"
        continue
    fi
    
    echo "📝 Applying migration: ${VERSION}..."
    
    # Run migration in a transaction
    if psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" --no-password -f "$migration_file"; then
        # Record successful migration
        psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" --no-password -c \
            "INSERT INTO schema_migrations (version) VALUES ('$VERSION') ON CONFLICT DO NOTHING"
        
        echo -e "${GREEN}✅ Migration applied: ${VERSION}${NC}"
        ((SUCCESS_COUNT++))
    else
        echo -e "${RED}❌ Migration failed: ${VERSION}${NC}"
        ((FAILED_COUNT++))
        exit 1
    fi
done

echo ""
echo -e "${GREEN}✅ Migrations complete: ${SUCCESS_COUNT} applied, ${FAILED_COUNT} failed${NC}"
