#!/bin/bash
set -e

# Server hardening script for Hetzner production deployment
# Run this script as root on a fresh Hetzner server

echo "🔒 Starting server hardening process..."

# Update system
echo "📦 Updating system packages..."
apt-get update
apt-get upgrade -y

# Install essential packages
echo "📦 Installing essential packages..."
apt-get install -y \
    ufw \
    fail2ban \
    unattended-upgrades \
    apt-listchanges \
    docker.io \
    docker-compose \
    certbot \
    python3-certbot-nginx \
    htop \
    curl \
    wget \
    git \
    vim \
    logrotate

# Configure automatic security updates
echo "🔄 Configuring automatic security updates..."
cat > /etc/apt/apt.conf.d/50unattended-upgrades <<EOF
Unattended-Upgrade::Allowed-Origins {
    "\${distro_id}:\${distro_codename}-security";
    "\${distro_id}ESMApps:\${distro_codename}-apps-security";
    "\${distro_id}:\${distro_codename}-updates";
};
Unattended-Upgrade::AutoFixInterruptedDpkg "true";
Unattended-Upgrade::MinimalSteps "true";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-New-Unused-Dependencies "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
EOF

cat > /etc/apt/apt.conf.d/20auto-upgrades <<EOF
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
EOF

# Configure firewall
echo "🔥 Configuring UFW firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing

# Allow SSH (important: do this before enabling firewall!)
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'

# Enable firewall
ufw --force enable

# Configure fail2ban
echo "🛡️ Configuring fail2ban..."
cat > /etc/fail2ban/jail.local <<EOF
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5
destemail = root@localhost
sendername = Fail2Ban
action = %(action_)s

[sshd]
enabled = true
port = 22
logpath = %(sshd_log)s
maxretry = 3

[nginx-http-auth]
enabled = true
port = http,https
logpath = /var/log/nginx/error.log

[nginx-limit-req]
enabled = true
port = http,https
logpath = /var/log/nginx/error.log
maxretry = 10
EOF

systemctl enable fail2ban
systemctl restart fail2ban

# Configure SSH security
echo "🔐 Hardening SSH configuration..."
if [ ! -f /etc/ssh/sshd_config.backup ]; then
    cp /etc/ssh/sshd_config /etc/ssh/sshd_config.backup
fi

# SSH hardening settings
sed -i 's/#PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/#PubkeyAuthentication yes/PubkeyAuthentication yes/' /etc/ssh/sshd_config
sed -i 's/#MaxAuthTries 6/MaxAuthTries 3/' /etc/ssh/sshd_config

# Add additional SSH security settings if not present
if ! grep -q "ClientAliveInterval" /etc/ssh/sshd_config; then
    echo "ClientAliveInterval 300" >> /etc/ssh/sshd_config
    echo "ClientAliveCountMax 2" >> /etc/ssh/sshd_config
fi

# Restart SSH (be careful - make sure you have SSH key access!)
echo "⚠️  Restarting SSH service. Make sure you have SSH key access before continuing!"
read -p "Press Enter to continue or Ctrl+C to abort..."
systemctl restart sshd

# Create non-root user for Docker operations
echo "👤 Setting up non-root user for Docker..."
if ! id -u metaspn > /dev/null 2>&1; then
    useradd -m -s /bin/bash metaspn
    usermod -aG docker metaspn
    echo "User 'metaspn' created and added to docker group"
else
    echo "User 'metaspn' already exists"
    usermod -aG docker metaspn
fi

# Configure Docker daemon security
echo "🐳 Configuring Docker daemon security..."
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<EOF
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "userland-proxy": false,
  "no-new-privileges": true
}
EOF

systemctl restart docker

# Create application directory structure
echo "📁 Creating application directory structure..."
mkdir -p /opt/metaspn
mkdir -p /etc/metaspn
mkdir -p /var/log/metaspn
chown -R metaspn:metaspn /opt/metaspn
chmod 700 /etc/metaspn

# Set up log rotation
echo "📝 Configuring log rotation..."
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
        docker-compose -f /opt/metaspn/docker-compose.prod.yml restart backend frontend worker || true
    endscript
}
EOF

echo "✅ Server hardening complete!"
echo ""
echo "Next steps:"
echo "1. Add your SSH public key to /home/metaspn/.ssh/authorized_keys"
echo "2. Configure production environment variables in /etc/metaspn/.env.prod"
echo "3. Clone the repository to /opt/metaspn"
echo "4. Set up SSL certificates with certbot"
echo "5. Start the application with docker-compose"
