# Production Deployment Guide

This guide covers the complete process of deploying MetaSPN Pro to a Hetzner server with CI/CD automation.

## Prerequisites

- Hetzner Cloud or Dedicated Server (Ubuntu 22.04+ recommended)
- Domain name pointing to your server's IP address
- GitHub repository with GitHub Actions enabled
- SSH access to the server
- Basic knowledge of Docker and Linux

## Initial Server Setup

### 1. Provision Hetzner Server

- Create a new server (minimum 2 vCPU, 4GB RAM recommended)
- Choose Ubuntu 22.04 LTS
- Set up SSH key authentication
- Note your server's IP address

### 2. Run Server Hardening Script

SSH into your server and run:

```bash
# Download and run the setup script
curl -O https://raw.githubusercontent.com/your-repo/metaspn-pro/main/scripts/setup-server.sh
chmod +x setup-server.sh
sudo ./setup-server.sh
```

This script will:
- Update system packages
- Install Docker and Docker Compose
- Configure firewall (UFW)
- Set up fail2ban
- Configure automatic security updates
- Create non-root user for Docker operations
- Set up log rotation

### 3. Configure SSH Access

Add your SSH public key to the `metaspn` user:

```bash
sudo mkdir -p /home/metaspn/.ssh
sudo cp ~/.ssh/authorized_keys /home/metaspn/.ssh/
sudo chown -R metaspn:metaspn /home/metaspn/.ssh
sudo chmod 700 /home/metaspn/.ssh
sudo chmod 600 /home/metaspn/.ssh/authorized_keys
```

### 4. Clone Repository

```bash
sudo mkdir -p /opt/metaspn
sudo chown metaspn:metaspn /opt/metaspn
sudo -u metaspn git clone https://github.com/your-repo/metaspn-pro.git /opt/metaspn
```

## SSL Certificate Setup

### 1. Install Certbot

```bash
sudo apt-get update
sudo apt-get install -y certbot python3-certbot-nginx
```

### 2. Obtain SSL Certificate

```bash
sudo certbot certonly --standalone -d your-domain.com
```

This will create certificates in `/etc/letsencrypt/live/your-domain.com/`

### 3. Set Up Certificate Renewal

Certbot automatically sets up a renewal cron job. Test renewal with:

```bash
sudo certbot renew --dry-run
```

## Environment Configuration

### 1. Create Production Environment File

```bash
sudo cp /opt/metaspn/.env.prod.example /etc/metaspn/.env.prod
sudo chmod 600 /etc/metaspn/.env.prod
sudo chown root:root /etc/metaspn/.env.prod
```

### 2. Configure Secrets

Edit the environment file:

```bash
sudo nano /etc/metaspn/.env.prod
```

Or use the interactive script:

```bash
sudo /opt/metaspn/scripts/deploy-secrets.sh
```

### 3. Validate Secrets

```bash
sudo /opt/metaspn/scripts/validate-secrets.sh
```

## GitHub Actions Configuration

### 1. Add GitHub Secrets

Go to your repository → Settings → Secrets and variables → Actions, and add:

- `PRODUCTION_HOST`: Your server's IP address or hostname
- `PRODUCTION_USER`: SSH user (usually `metaspn`)
- `PRODUCTION_SSH_KEY`: Your private SSH key for server access
- `PRODUCTION_SSH_PORT`: SSH port (default: 22)
- `POSTGRES_USER`: Database username
- `POSTGRES_DB`: Database name
- `SLACK_WEBHOOK_URL`: (Optional) Slack webhook for notifications

### 2. Configure Production Environment

In GitHub → Settings → Environments → New environment → `production`:
- Add required secrets
- Set deployment branch to `main`

## First Deployment

### 1. Build and Start Services

```bash
cd /opt/metaspn
sudo docker-compose -f docker-compose.prod.yml build
sudo docker-compose -f docker-compose.prod.yml up -d
```

### 2. Run Database Migrations

```bash
sudo docker-compose -f docker-compose.prod.yml exec backend /scripts/run-migrations.sh
```

Or manually:

```bash
sudo docker-compose -f docker-compose.prod.yml exec postgres psql -U metaspn -d metaspn -f /opt/metaspn/database/schema.sql
```

### 3. Verify Deployment

```bash
# Check container status
sudo docker-compose -f docker-compose.prod.yml ps

# Check logs
sudo docker-compose -f docker-compose.prod.yml logs -f

# Run health checks
sudo /opt/metaspn/scripts/health-check.sh
```

### 4. Set Up Nginx

Copy SSL certificates to Nginx directory:

```bash
sudo mkdir -p /etc/nginx/ssl
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem /etc/nginx/ssl/
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem /etc/nginx/ssl/
sudo chmod 600 /etc/nginx/ssl/*
```

Add Nginx to docker-compose.prod.yml or run separately:

```bash
cd /opt/metaspn
sudo docker build -t metaspn-nginx -f nginx/Dockerfile .
sudo docker run -d \
  --name metaspn-nginx \
  --network metaspn-network \
  -p 80:80 -p 443:443 \
  -v /etc/nginx/ssl:/etc/nginx/ssl:ro \
  metaspn-nginx
```

## Ongoing Deployments

After initial setup, deployments are automated via GitHub Actions:

1. Push code to `main` branch
2. GitHub Actions runs CI pipeline (lint, build, test)
3. On success, CD pipeline:
   - Builds production Docker images
   - Pushes to GitHub Container Registry
   - SSHes to server and pulls images
   - Runs database migrations
   - Deploys new containers
   - Runs health checks
   - Rolls back on failure

### Manual Deployment

If needed, deploy manually:

```bash
cd /opt/metaspn
sudo /opt/metaspn/scripts/deploy.sh
```

## Monitoring

### View Logs

```bash
# All services
sudo /opt/metaspn/scripts/view-logs.sh all

# Specific service
sudo /opt/metaspn/scripts/view-logs.sh backend
sudo /opt/metaspn/scripts/view-logs.sh frontend
```

### System Monitoring

```bash
sudo /opt/metaspn/scripts/monitor.sh
```

### Set Up Monitoring Cron Job

```bash
# Add to crontab
sudo crontab -e

# Add this line to run monitoring every 5 minutes
*/5 * * * * /opt/metaspn/scripts/monitor.sh >> /var/log/metaspn/monitor.log 2>&1
```

## Backups

### Manual Backup

```bash
# Database only
sudo /opt/metaspn/scripts/backup-database.sh

# Complete backup (database + config + SSL)
sudo /opt/metaspn/scripts/backup-all.sh
```

### Automated Backups

Backups run automatically via the `db-backup` service in docker-compose.prod.yml. Configure retention in `.env.prod`:

```bash
BACKUP_RETENTION_DAYS=30
BACKUP_STORAGE_PATH=/backups
```

### Restore Backup

```bash
sudo /opt/metaspn/scripts/restore-database.sh /backups/metaspn_backup_YYYYMMDD_HHMMSS.sql.gz
```

## Maintenance

### Update Application

Deployments are automated via GitHub Actions. For manual updates:

```bash
cd /opt/metaspn
sudo git pull
sudo docker-compose -f docker-compose.prod.yml build
sudo docker-compose -f docker-compose.prod.yml up -d
```

### Rotate Secrets

```bash
# Rotate all secrets
sudo /opt/metaspn/scripts/rotate-secrets.sh all

# Rotate specific secret
sudo /opt/metaspn/scripts/rotate-secrets.sh jwt
```

### Update SSL Certificates

Certificates auto-renew via certbot. Manual renewal:

```bash
sudo certbot renew
sudo docker restart metaspn-nginx
```

## Troubleshooting

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for common issues and solutions.

## Security Checklist

- [ ] Firewall configured (UFW)
- [ ] SSH key-only authentication
- [ ] Fail2ban installed and configured
- [ ] SSL/TLS certificates installed
- [ ] Secrets stored securely
- [ ] Database SSL enabled
- [ ] Regular security updates enabled
- [ ] Docker daemon secured
- [ ] Non-root user for operations
- [ ] Rate limiting configured
- [ ] Security headers set
- [ ] Monitoring and logging active

## Next Steps

- Set up external monitoring (UptimeRobot, Pingdom, etc.)
- Configure error tracking (Sentry)
- Set up log aggregation
- Implement blue-green deployments
- Add performance monitoring (APM)
