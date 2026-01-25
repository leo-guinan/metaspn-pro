# Ubuntu 24.04 LTS Setup Guide

This guide is specific to setting up MetaSPN Pro on **Ubuntu 24.04 LTS (Noble Numbat)**.

## Why Ubuntu 24.04 LTS?

- **Long-term support**: Supported until April 2029 (vs 22.04 until 2027)
- **Current LTS**: Latest stable LTS release with better hardware support
- **Better performance**: Newer kernel and optimized packages
- **Modern tooling**: Better Docker, Node.js, and package support

## Quick Start

### 1. Provision Server

On Hetzner Cloud:
1. Create new server
2. Select **Ubuntu 24.04 LTS**
3. Minimum specs: 2 vCPU, 2GB RAM (for managed services setup)
4. Add your SSH key
5. Note your server IP address

### 2. Verify Ubuntu Version

```bash
# SSH into your server
ssh root@your-server-ip

# Verify version
lsb_release -a
# Should show: Ubuntu 24.04 LTS (Noble Numbat)
```

### 3. Set Up SSH Key Authentication

**⚠️ CRITICAL:** Do this **BEFORE** running the setup script! The setup script will disable password authentication.

See [SSH_SETUP.md](./SSH_SETUP.md) for complete instructions.

**Quick steps:**
1. Generate SSH key (if needed): `ssh-keygen -t ed25519 -C "your_email@example.com"`
2. Add to Hetzner Cloud Console → Security → SSH Keys
3. Test: `ssh root@your-server-ip` (should connect without password)

### 4. Run Setup Script

```bash
# Download setup script
curl -O https://raw.githubusercontent.com/your-repo/metaspn-pro/main/scripts/setup-server.sh
chmod +x setup-server.sh

# Verify Ubuntu version first (optional)
./scripts/verify-ubuntu-version.sh

# Run setup (as root)
sudo ./setup-server.sh
```

The setup script will:
- ✅ Verify Ubuntu 24.04 LTS
- ✅ Update all system packages
- ✅ Install Docker from official repository (recommended method for 24.04)
- ✅ Install Docker Compose plugin
- ✅ Configure firewall (UFW)
- ✅ Set up fail2ban
- ✅ Configure automatic security updates
- ✅ Harden SSH configuration
- ✅ Create `metaspn` user for Docker operations
- ✅ Set up log rotation

### 5. Post-Setup Verification

```bash
# Check Docker installation
docker --version
# Should show: Docker version 24.x.x or newer

docker compose version
# Should show: Docker Compose version v2.x.x

# Check system info
uname -r
# Should show: 6.8.x kernel (Ubuntu 24.04 default)

# Verify user setup
id metaspn
# Should show: metaspn user with docker group
```

## Ubuntu 24.04 Specific Notes

### Docker Installation

Ubuntu 24.04 uses the official Docker repository installation method, which:
- Provides the latest stable Docker version
- Includes Docker Compose as a plugin (not standalone)
- Uses `docker compose` (v2) syntax instead of `docker-compose` (v1)

**Important:** Always use `docker compose` (with space) not `docker-compose` (with hyphen) on Ubuntu 24.04.

### Package Management

Ubuntu 24.04 uses:
- `apt` (recommended) or `apt-get` (both work)
- Newer package versions by default
- Better dependency resolution

### System Services

All services use `systemd` (same as 22.04):
```bash
# Check service status
systemctl status docker
systemctl status fail2ban
systemctl status sshd
```

## Troubleshooting

### Docker Not Starting

```bash
# Check Docker service
sudo systemctl status docker

# View logs
sudo journalctl -u docker -n 50

# Restart Docker
sudo systemctl restart docker
```

### Permission Denied for Docker

```bash
# Ensure user is in docker group
sudo usermod -aG docker metaspn

# Log out and back in, or:
newgrp docker

# Test
docker ps
```

### Package Installation Issues

```bash
# Update package lists
sudo apt update

# Fix broken packages
sudo apt --fix-broken install

# Clean package cache
sudo apt clean
```

## Next Steps

After setup is complete:
1. Add your SSH key to the `metaspn` user (see [SSH_SETUP.md](./SSH_SETUP.md))
2. Continue with [DEPLOYMENT.md](./DEPLOYMENT.md) - Full deployment guide
3. Configure Neon.tech and Chroma Cloud credentials
4. Review [PRODUCTION.md](./PRODUCTION.md) - Production configuration

## References

- [Ubuntu 24.04 Release Notes](https://wiki.ubuntu.com/NobleNumbat/ReleaseNotes)
- [Docker Installation for Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
- [Hetzner Cloud Documentation](https://docs.hetzner.com/cloud/)
