#!/bin/bash
set -e

# Logging setup script
# This script sets up structured logging and log rotation

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "📝 Setting up logging configuration..."

# Create log directory
LOG_DIR="/var/log/metaspn"
mkdir -p "$LOG_DIR"
chown metaspn:metaspn "$LOG_DIR"
chmod 755 "$LOG_DIR"

# Configure Docker logging driver
echo "🐳 Configuring Docker logging..."
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<EOF
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3",
    "labels": "production"
  }
}
EOF

# Restart Docker to apply changes
if systemctl is-active --quiet docker; then
    echo "🔄 Restarting Docker daemon..."
    systemctl restart docker
fi

# Set up logrotate for application logs
echo "🔄 Configuring log rotation..."
cat > /etc/logrotate.d/metaspn <<EOF
/var/log/metaspn/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 metaspn metaspn
    sharedscripts
    postrotate
        # Reload containers to reopen log files
        docker compose -f /opt/metaspn/docker-compose.prod.yml restart backend frontend worker || true
    endscript
}

# Docker container logs
/var/lib/docker/containers/*/*.log {
    daily
    rotate 7
    compress
    delaycompress
    notifempty
    missingok
    copytruncate
}
EOF

# Create logging helper script
cat > /opt/metaspn/scripts/view-logs.sh <<'EOF'
#!/bin/bash
# View application logs

SERVICE=${1:-all}

case "$SERVICE" in
    backend)
        docker logs -f metaspn-backend-prod
        ;;
    frontend)
        docker logs -f metaspn-frontend-prod
        ;;
    worker)
        docker logs -f metaspn-worker-prod
        ;;
    postgres|db)
        docker logs -f metaspn-postgres-prod
        ;;
    nginx)
        docker logs -f metaspn-nginx-prod 2>/dev/null || echo "Nginx container not found"
        ;;
    all)
        docker compose -f /opt/metaspn/docker-compose.prod.yml logs -f
        ;;
    *)
        echo "Usage: $0 [backend|frontend|worker|postgres|nginx|all]"
        exit 1
        ;;
esac
EOF

chmod +x /opt/metaspn/scripts/view-logs.sh

echo -e "${GREEN}✅ Logging configuration complete!${NC}"
echo ""
echo "Log files location: $LOG_DIR"
echo "View logs with: /opt/metaspn/scripts/view-logs.sh [service]"
