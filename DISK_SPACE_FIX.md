# Disk Space Issue - Fix Guide

## Problem

Deployment fails with error:
```
failed to extract layer ... to overlayfs ... write ... no space left on device
```

This happens when the server runs out of disk space while pulling Docker images.

## Quick Fix

Run this script on your production server:

```bash
bash /opt/metaspn/scripts/fix-disk-space.sh
```

This script will:
1. Check current disk usage
2. Stop containers temporarily (if needed)
3. Clean up old Docker images, containers, volumes, and build cache
4. Restart containers
5. Show you the freed space

## Manual Fix

If you prefer to do it manually:

### Step 1: Check Disk Space

```bash
df -h
docker system df
```

### Step 2: Clean Up Docker Resources

**Option A: Aggressive cleanup (removes everything unused)**
```bash
docker system prune -a -f --volumes
```

**Option B: Selective cleanup (safer)**
```bash
# Remove unused images (keeps images from last 48 hours)
docker image prune -a -f --filter "until=48h"

# Remove stopped containers
docker container prune -f

# Remove unused volumes (be careful - this removes volumes not used by any container)
docker volume prune -f

# Remove build cache
docker builder prune -a -f --filter "until=24h"
```

### Step 3: Verify Space Freed

```bash
df -h
docker system df
```

### Step 4: Retry Deployment

After cleanup, retry your deployment. The deployment workflow now automatically checks disk space and cleans up if needed.

## Prevention

### Automatic Cleanup

Add a cron job to automatically clean up old Docker resources:

```bash
# Edit crontab
sudo crontab -e

# Add this line to clean up weekly (runs every Sunday at 2 AM)
0 2 * * 0 docker system prune -a -f --filter "until=168h" && docker volume prune -f
```

### Monitor Disk Space

Set up monitoring to alert you when disk space gets low:

```bash
# Check disk usage
df -h / | awk 'NR==2 {print $5}' | sed 's/%//'

# If above 80%, consider cleanup
```

### Increase Disk Size

If you're consistently running out of space, consider:
1. Increasing the server's disk size (if using a cloud provider)
2. Moving Docker data to a larger volume
3. Setting up log rotation for Docker containers

## What Gets Cleaned Up

The cleanup script removes:
- **Unused images**: Old versions of your app images
- **Stopped containers**: Containers that are no longer running
- **Unused volumes**: Volumes not attached to any container
- **Build cache**: Cached layers from Docker builds

**It does NOT remove:**
- Currently running containers
- Volumes attached to running containers
- Recent images (last 24-48 hours)
- Your `.env` files or application data

## Troubleshooting

### Still Running Out of Space

1. **Check what's using space:**
   ```bash
   du -sh /var/lib/docker/*
   docker system df -v
   ```

2. **Check for large log files:**
   ```bash
   docker compose -f docker-compose.prod.yml logs --tail=0 | wc -l
   # If logs are huge, consider log rotation
   ```

3. **Check for orphaned volumes:**
   ```bash
   docker volume ls
   # Remove specific unused volumes if needed
   ```

4. **Check system logs:**
   ```bash
   sudo journalctl --disk-usage
   # Clean old system logs if needed
   sudo journalctl --vacuum-time=7d
   ```

### Containers Won't Start After Cleanup

If containers fail to start after cleanup:

1. **Check if volumes were accidentally removed:**
   ```bash
   docker compose -f docker-compose.prod.yml config
   ```

2. **Restart containers:**
   ```bash
   cd /opt/metaspn
   docker compose -f docker-compose.prod.yml --env-file /opt/metaspn/.env up -d
   ```

3. **Check logs:**
   ```bash
   docker compose -f docker-compose.prod.yml logs
   ```

### Deployment Still Fails

If deployment still fails after cleanup:

1. **Check available space:**
   ```bash
   df -h
   # Need at least 1-2GB free for image pulls
   ```

2. **Try pulling images one at a time:**
   ```bash
   docker pull ghcr.io/leo-guinan/metaspn-pro/backend:latest
   docker pull ghcr.io/leo-guinan/metaspn-pro/frontend:latest
   ```

3. **Check Docker daemon logs:**
   ```bash
   sudo journalctl -u docker.service --tail=50
   ```

## Disk Space Requirements

Minimum recommended free space:
- **For deployment**: 2GB+ free
- **For normal operation**: 1GB+ free
- **For image pulls**: 500MB+ per image

Your images are typically:
- Backend: ~500MB-1GB
- Frontend: ~500MB-1GB
- Nginx: ~50MB
- Total: ~1-2GB for all images

## Best Practices

1. **Regular cleanup**: Set up weekly cleanup via cron
2. **Monitor space**: Check disk usage regularly
3. **Log rotation**: Configure Docker log rotation in `docker-compose.prod.yml`
4. **Image tagging**: Use specific tags instead of `latest` to avoid accumulating old images
5. **Volume management**: Only create volumes for data that needs persistence

## Related Files

- `/opt/metaspn/scripts/fix-disk-space.sh` - Automated cleanup script
- `docker-compose.prod.yml` - Log rotation configuration
- `.github/workflows/deploy-production.yml` - Deployment workflow (now checks disk space)
