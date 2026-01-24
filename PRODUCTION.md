# Production Configuration Guide

This document covers production-specific configurations and best practices for MetaSPN Pro.

## Environment Variables

### Required Variables

All required environment variables must be set in `/etc/metaspn/.env.prod`:

```bash
# Database
POSTGRES_USER=metaspn
POSTGRES_PASSWORD=<strong-password>
POSTGRES_DB=metaspn
DATABASE_URL=postgresql://metaspn:<password>@postgres:5432/metaspn

# API Keys
OPENAI_API_KEY=<your-key>
ANTHROPIC_API_KEY=<your-key>

# Authentication
JWT_SECRET=<64-char-random-string>
NEXTAUTH_SECRET=<64-char-random-string>
NEXTAUTH_URL=https://your-domain.com

# OAuth (Production URLs)
TWITTER_CLIENT_ID=<your-id>
TWITTER_CLIENT_SECRET=<your-secret>
TWITTER_CALLBACK_URL=https://your-domain.com/api/auth/twitter/callback

GITHUB_CLIENT_ID=<your-id>
GITHUB_CLIENT_SECRET=<your-secret>
GITHUB_CALLBACK_URL=https://your-domain.com/api/auth/github/callback
GITHUB_TOKEN_ENCRYPTION_KEY=<32-char-random-string>

# Frontend
FRONTEND_URL=https://your-domain.com
NEXT_PUBLIC_API_URL=https://your-domain.com/api
```

### Generating Secure Secrets

Use the rotation script to generate secure secrets:

```bash
sudo /opt/metaspn/scripts/rotate-secrets.sh all
```

Or generate manually:

```bash
# JWT and NextAuth secrets (64 characters)
openssl rand -hex 32

# GitHub token encryption key (32 characters)
openssl rand -hex 16
```

## Docker Configuration

### Resource Limits

Production containers have resource limits configured in `docker-compose.prod.yml`:

- **Backend**: 2 CPU, 2GB RAM (limit), 0.5 CPU, 512MB RAM (reservation)
- **Frontend**: 2 CPU, 2GB RAM (limit), 0.5 CPU, 512MB RAM (reservation)
- **Worker**: 1 CPU, 1GB RAM (limit), 0.25 CPU, 256MB RAM (reservation)
- **PostgreSQL**: 2 CPU, 2GB RAM (limit), 0.5 CPU, 512MB RAM (reservation)

Adjust based on your server's resources.

### Health Checks

All services have health checks configured:

- **Backend**: `GET /health` endpoint
- **Frontend**: HTTP check on port 3000
- **PostgreSQL**: `pg_isready` check

Health checks run every 30 seconds with 3 retries.

## Database Configuration

### PostgreSQL Settings

Production PostgreSQL configuration is in `database/postgresql.conf`:

- Shared buffers: 256MB
- Effective cache size: 1GB
- Max connections: 100
- WAL size: 1GB
- Query logging for slow queries (>1s)

### Connection Pooling

The backend uses PostgreSQL connection pooling. Configure in `backend/src/db/index.ts`:

```typescript
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20, // Maximum pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})
```

### Database Backups

- **Frequency**: Daily
- **Retention**: 30 days (configurable)
- **Location**: `/backups` (Docker volume)
- **Format**: Compressed SQL dump

Backups run automatically via the `db-backup` service.

## Nginx Configuration

### SSL/TLS

- **Protocols**: TLSv1.2, TLSv1.3
- **Ciphers**: High security ciphers only
- **HSTS**: Enabled with 1 year max-age
- **Certificate**: Let's Encrypt (auto-renewal)

### Security Headers

- `Strict-Transport-Security`: HSTS
- `X-Frame-Options`: SAMEORIGIN
- `X-Content-Type-Options`: nosniff
- `X-XSS-Protection`: 1; mode=block
- `Referrer-Policy`: strict-origin-when-cross-origin
- `Content-Security-Policy`: Configured for Next.js

### Rate Limiting

- **API endpoints**: 10 requests/second (burst: 20)
- **General endpoints**: 30 requests/second (burst: 50)

### Gzip Compression

Enabled for:
- Text files (HTML, CSS, JS, JSON, XML)
- Font files
- SVG images

## Monitoring

### Health Checks

Health check endpoints:

- **Backend**: `https://your-domain.com/api/health`
- **Frontend**: `https://your-domain.com/` (root)

### Monitoring Script

Run the monitoring script to check system health:

```bash
sudo /opt/metaspn/scripts/monitor.sh
```

Checks:
- CPU usage
- Memory usage
- Disk space
- Container status
- Application health
- Database connection

### Logging

- **Location**: `/var/log/metaspn/`
- **Rotation**: Daily, 14 days retention
- **Format**: JSON (Docker logs)
- **View logs**: `sudo /opt/metaspn/scripts/view-logs.sh [service]`

## Security

### Firewall

UFW configured to allow only:
- Port 22 (SSH)
- Port 80 (HTTP - redirects to HTTPS)
- Port 443 (HTTPS)

### Fail2ban

Configured for:
- SSH protection (3 failed attempts = 1 hour ban)
- Nginx HTTP auth protection
- Rate limiting violations

### Secrets Management

- Secrets stored in `/etc/metaspn/.env.prod` (600 permissions)
- Never committed to repository
- Rotated regularly
- Backed up encrypted

### Database Security

- SSL/TLS connections enabled
- Strong passwords required
- Connection limits enforced
- Regular backups

## Performance

### Caching

- **Next.js**: Built-in static asset caching
- **Nginx**: Static file caching (1 year)
- **Database**: Connection pooling

### Optimization

- Multi-stage Docker builds
- Production builds (minified, optimized)
- Gzip compression
- CDN for static assets (optional)

## Scaling

### Horizontal Scaling

To scale services:

```bash
# Scale backend
docker-compose -f docker-compose.prod.yml up -d --scale backend=3

# Scale frontend
docker-compose -f docker-compose.prod.yml up -d --scale frontend=2
```

### Load Balancing

Use Nginx or a load balancer for multiple instances:

```nginx
upstream backend {
    least_conn;
    server backend1:3001;
    server backend2:3001;
    server backend3:3001;
}
```

### Database Scaling

For high-traffic scenarios:
- Use read replicas
- Implement connection pooling
- Consider managed database service (Hetzner Database, AWS RDS)

## Backup and Recovery

### Backup Strategy

1. **Database**: Daily automated backups
2. **Configuration**: Included in full backup
3. **SSL Certificates**: Included in full backup
4. **Application Code**: Version controlled in Git

### Recovery Procedures

1. **Database Restore**: See [DEPLOYMENT.md](./DEPLOYMENT.md)
2. **Full System Restore**: Restore from full backup archive
3. **Rollback Deployment**: Use rollback script

### Disaster Recovery

1. Regular backups to external storage (Hetzner Storage Box, S3)
2. Documented recovery procedures
3. Tested restore process
4. Off-site backup storage

## Maintenance Windows

### Scheduled Maintenance

- **Database backups**: Daily at 2 AM UTC
- **SSL certificate renewal**: Automatic (certbot)
- **Security updates**: Automatic (unattended-upgrades)
- **Log rotation**: Daily

### Zero-Downtime Deployments

Current setup supports zero-downtime with:
- Health checks before marking deployment successful
- Automatic rollback on failure
- Blue-green deployment (future enhancement)

## Compliance

### Data Protection

- User data encrypted at rest (database)
- OAuth tokens encrypted
- SSL/TLS for all connections
- Secure secret storage

### Logging and Auditing

- All API requests logged
- Authentication events logged
- Database queries logged (slow queries)
- Security events logged (fail2ban)

## Support

For production issues:
1. Check logs: `sudo /opt/metaspn/scripts/view-logs.sh all`
2. Run monitoring: `sudo /opt/metaspn/scripts/monitor.sh`
3. See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
4. Check GitHub Issues
