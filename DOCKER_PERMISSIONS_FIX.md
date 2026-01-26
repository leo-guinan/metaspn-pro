# Docker Permission Error - Fix Guide

## Problem

Deployment fails with error:
```
mkdir /home/***/.docker: permission denied
```

This happens when Docker tries to create a cache directory in the user's home directory but doesn't have permission.

## Quick Fix

Run this script on your production server:

```bash
bash /opt/metaspn/scripts/fix-docker-permissions.sh
```

This will:
1. Ensure your home directory exists
2. Create the `.docker` directory with proper permissions
3. Verify Docker access
4. Check if you're in the docker group

## Manual Fix

### Step 1: Ensure Home Directory Exists

```bash
# Check if home directory exists
ls -la ~

# If it doesn't exist, create it (may need sudo)
sudo mkdir -p ~
sudo chown $(whoami):$(whoami) ~
sudo chmod 755 ~
```

### Step 2: Create .docker Directory

```bash
# Create .docker directory
mkdir -p ~/.docker
chmod 755 ~/.docker
```

### Step 3: Verify Docker Group Membership

```bash
# Check if you're in the docker group
groups | grep docker

# If not, add yourself (requires sudo)
sudo usermod -aG docker $(whoami)

# Then log out and back in for changes to take effect
```

### Step 4: Test Docker Access

```bash
# Test Docker
docker ps

# If it works, you're good!
```

## Why This Happens

Docker BuildKit (the modern Docker build engine) tries to create a cache directory in `~/.docker` to speed up builds. If:
- The home directory doesn't exist
- The home directory isn't writable
- The user doesn't have permission to create directories in their home

Then the build fails with a permission error.

## Prevention

The deployment workflow now:
1. Checks if the home directory exists
2. Creates the `.docker` directory if needed
3. Falls back to `/tmp/.docker-username` if home directory isn't writable
4. Disables BuildKit if it causes issues (uses legacy build instead)

## Alternative: Use Different Cache Location

If you can't fix the home directory permissions, you can set `DOCKER_CONFIG` to a writable location:

```bash
export DOCKER_CONFIG=/tmp/.docker-$(whoami)
mkdir -p "$DOCKER_CONFIG"
docker compose -f docker-compose.prod.yml build nginx
```

## Troubleshooting

### Still Getting Permission Errors

1. **Check home directory permissions:**
   ```bash
   ls -la ~
   # Should show your user as owner
   ```

2. **Check if you can write to home directory:**
   ```bash
   touch ~/test && rm ~/test && echo "✅ Writable" || echo "❌ Not writable"
   ```

3. **Check Docker group:**
   ```bash
   groups
   # Should include 'docker'
   ```

4. **Try building with BuildKit disabled:**
   ```bash
   DOCKER_BUILDKIT=0 docker compose -f docker-compose.prod.yml build nginx
   ```

### Home Directory Doesn't Exist

If the user's home directory doesn't exist (common with service accounts):

```bash
# Create home directory
sudo mkdir -p /home/$(whoami)
sudo chown $(whoami):$(whoami) /home/$(whoami)
sudo chmod 755 /home/$(whoami)

# Or set HOME to a writable location
export HOME=/tmp/home-$(whoami)
mkdir -p "$HOME"
```

### User Not in Docker Group

If you get "permission denied" when running Docker commands:

```bash
# Add user to docker group
sudo usermod -aG docker $(whoami)

# Log out and back in, or:
newgrp docker

# Verify
groups | grep docker
```

## Related Files

- `/opt/metaspn/scripts/fix-docker-permissions.sh` - Automated fix script
- `.github/workflows/deploy-production.yml` - Deployment workflow (now handles this automatically)
