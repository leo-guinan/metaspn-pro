# Domain Setup Guide for pro.metaspn.network

## Quick Debugging

Run the debugging script on your server:

```bash
bash /opt/metaspn/scripts/debug-domain.sh
```

This will check:
- DNS resolution
- Port accessibility
- Nginx status
- SSL certificates
- Service health
- Network connectivity

## Common Issues & Solutions

### 1. DNS Not Configured

**Symptom**: Domain doesn't resolve

**Fix**: 
1. Go to your DNS provider (e.g., Cloudflare, Namecheap, etc.)
2. Add an A record:
   - Name: `pro` (or `@` for root domain)
   - Type: `A`
   - Value: Your server's public IP address
   - TTL: 300 (or auto)

**Verify**:
```bash
dig +short pro.metaspn.network
# Should return your server IP
```

### 2. Nginx Not Running

**Symptom**: Ports 80/443 not listening

**Fix**:
```bash
cd /opt/metaspn
docker compose -f docker-compose.prod.yml up -d nginx
```

**Check status**:
```bash
docker compose -f docker-compose.prod.yml ps nginx
docker compose -f docker-compose.prod.yml logs nginx
```

### 3. SSL Certificates Missing

**Symptom**: HTTPS doesn't work, Nginx errors about missing certificates

**Fix**:
```bash
# Install certbot if not already installed
sudo apt-get update
sudo apt-get install -y certbot

# Get certificate (standalone mode - stops any service on port 80)
sudo certbot certonly --standalone -d pro.metaspn.network

# Copy certificates to Nginx location
sudo mkdir -p /etc/nginx/ssl
sudo cp /etc/letsencrypt/live/pro.metaspn.network/fullchain.pem /etc/nginx/ssl/
sudo cp /etc/letsencrypt/live/pro.metaspn.network/privkey.pem /etc/nginx/ssl/
sudo chmod 600 /etc/nginx/ssl/*

# Restart Nginx
docker compose -f docker-compose.prod.yml restart nginx
```

**Auto-renewal setup**:
```bash
# Test renewal
sudo certbot renew --dry-run

# Certbot automatically sets up a cron job for renewal
# You may want to add a script to copy renewed certs:
sudo nano /etc/letsencrypt/renewal-hooks/deploy/copy-nginx-certs.sh
```

Add this content:
```bash
#!/bin/bash
cp /etc/letsencrypt/live/pro.metaspn.network/fullchain.pem /etc/nginx/ssl/
cp /etc/letsencrypt/live/pro.metaspn.network/privkey.pem /etc/nginx/ssl/
chmod 600 /etc/nginx/ssl/*
docker compose -f /opt/metaspn/docker-compose.prod.yml restart nginx
```

Make it executable:
```bash
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/copy-nginx-certs.sh
```

### 4. Firewall Blocking Ports

**Symptom**: Can't connect from outside, but services work locally

**Fix**:
```bash
# Check UFW status
sudo ufw status

# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Verify
sudo ufw status numbered
```

### 5. Services Not Accessible Locally

**Symptom**: Backend/frontend not responding on localhost

**Check**:
```bash
# Backend health
curl http://localhost:3001/health

# Frontend
curl http://localhost:3000

# Container status
docker compose -f docker-compose.prod.yml ps

# Container logs
docker compose -f docker-compose.prod.yml logs backend
docker compose -f docker-compose.prod.yml logs frontend
```

### 6. Nginx Configuration Issues

**Check Nginx config**:
```bash
# Test configuration (if Nginx is in container)
docker compose -f docker-compose.prod.yml exec nginx nginx -t

# View Nginx logs
docker compose -f docker-compose.prod.yml logs nginx

# Check if domain is configured
docker compose -f docker-compose.prod.yml exec nginx cat /etc/nginx/conf.d/metaspn.conf | grep server_name
```

**Update domain in config**:
The Nginx config should have `server_name pro.metaspn.network;` in both HTTP and HTTPS server blocks.

## Step-by-Step Setup

### Initial Setup (One-Time)

1. **Configure DNS**:
   - Add A record: `pro.metaspn.network` → Your server IP
   - Wait for DNS propagation (can take up to 48 hours, usually < 1 hour)

2. **Get SSL Certificate**:
   ```bash
   sudo certbot certonly --standalone -d pro.metaspn.network
   ```

3. **Copy Certificates**:
   ```bash
   sudo mkdir -p /etc/nginx/ssl
   sudo cp /etc/letsencrypt/live/pro.metaspn.network/fullchain.pem /etc/nginx/ssl/
   sudo cp /etc/letsencrypt/live/pro.metaspn.network/privkey.pem /etc/nginx/ssl/
   sudo chmod 600 /etc/nginx/ssl/*
   ```

4. **Start Nginx**:
   ```bash
   cd /opt/metaspn
   docker compose -f docker-compose.prod.yml up -d nginx
   ```

5. **Configure Firewall**:
   ```bash
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   ```

6. **Verify**:
   ```bash
   curl -I https://pro.metaspn.network
   ```

### After Each Deployment

Nginx should automatically restart with the services. If not:

```bash
cd /opt/metaspn
docker compose -f docker-compose.prod.yml restart nginx
```

## Testing

### Local Testing

```bash
# Test backend directly
curl http://localhost:3001/health

# Test frontend directly
curl http://localhost:3000

# Test through Nginx (if running)
curl http://localhost/health
curl http://localhost
```

### External Testing

```bash
# Test HTTP (should redirect to HTTPS)
curl -I http://pro.metaspn.network

# Test HTTPS
curl -I https://pro.metaspn.network

# Test API endpoint
curl https://pro.metaspn.network/api/health
```

## Troubleshooting Commands

```bash
# Full system check
bash /opt/metaspn/scripts/debug-domain.sh

# Check DNS
dig +short pro.metaspn.network
nslookup pro.metaspn.network

# Check ports
sudo netstat -tuln | grep -E "80|443"
sudo ss -tuln | grep -E "80|443"

# Check containers
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=50

# Check Nginx specifically
docker compose -f docker-compose.prod.yml logs nginx
docker compose -f docker-compose.prod.yml exec nginx nginx -t

# Check firewall
sudo ufw status
sudo iptables -L -n | grep -E "80|443"
```

## Next Steps

Once everything is working:

1. Set up automatic SSL certificate renewal (see above)
2. Monitor Nginx logs for errors
3. Set up monitoring/alerting for service health
4. Consider adding rate limiting rules if needed
5. Review security headers in Nginx config
