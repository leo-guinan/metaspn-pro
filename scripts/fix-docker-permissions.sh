#!/bin/bash
# Fix Docker permission issues related to home directory

set -e

echo "🔧 Fixing Docker permissions..."

# Get current user
CURRENT_USER=$(whoami)
HOME_DIR=$(eval echo ~$CURRENT_USER)

echo "User: $CURRENT_USER"
echo "Home directory: $HOME_DIR"

# Ensure home directory exists
if [ ! -d "$HOME_DIR" ]; then
    echo "📁 Creating home directory..."
    sudo mkdir -p "$HOME_DIR"
    sudo chown "$CURRENT_USER:$CURRENT_USER" "$HOME_DIR"
    sudo chmod 755 "$HOME_DIR"
fi

# Ensure .docker directory exists and is writable
DOCKER_DIR="$HOME_DIR/.docker"
if [ ! -d "$DOCKER_DIR" ]; then
    echo "📁 Creating .docker directory..."
    mkdir -p "$DOCKER_DIR"
    chmod 755 "$DOCKER_DIR"
else
    echo "✅ .docker directory exists"
    # Fix permissions if needed
    chmod 755 "$DOCKER_DIR" 2>/dev/null || {
        echo "⚠️  Cannot fix permissions, may need sudo"
        sudo chown -R "$CURRENT_USER:$CURRENT_USER" "$DOCKER_DIR"
        sudo chmod 755 "$DOCKER_DIR"
    }
fi

# Check if user is in docker group
if groups | grep -q docker; then
    echo "✅ User is in docker group"
else
    echo "⚠️  User is not in docker group"
    echo "   💡 Add user to docker group: sudo usermod -aG docker $CURRENT_USER"
    echo "   Then log out and back in for changes to take effect"
fi

# Test Docker access
echo ""
echo "🧪 Testing Docker access..."
if docker ps > /dev/null 2>&1; then
    echo "✅ Docker is accessible"
else
    echo "❌ Cannot access Docker"
    echo "   💡 Try: sudo usermod -aG docker $CURRENT_USER"
    echo "   Then log out and back in"
fi

echo ""
echo "✅ Permission fix complete!"
