#!/bin/bash
# Quick script to verify Ubuntu version before running setup

if [ -f /etc/os-release ]; then
    . /etc/os-release
    echo "Detected OS: $PRETTY_NAME"
    
    if [ "$ID" = "ubuntu" ] && [ "$VERSION_ID" = "24.04" ]; then
        echo "✅ Ubuntu 24.04 LTS detected - ready for setup!"
        exit 0
    elif [ "$ID" = "ubuntu" ]; then
        echo "⚠️  Detected Ubuntu $VERSION_ID, but this setup is optimized for Ubuntu 24.04 LTS"
        echo "   The setup script may still work, but Ubuntu 24.04 is recommended"
        exit 1
    else
        echo "❌ This setup is designed for Ubuntu 24.04 LTS"
        echo "   Detected: $PRETTY_NAME"
        exit 1
    fi
else
    echo "❌ Could not detect OS version"
    exit 1
fi
