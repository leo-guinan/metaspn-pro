#!/bin/bash
# Script to verify SSH key setup on the server
# Run this on your production server to debug SSH key authentication

set -e

echo "=== SSH Key Verification Script ==="
echo ""

# Check SSH directory
echo "1. Checking ~/.ssh directory..."
if [ -d ~/.ssh ]; then
    echo "   ✅ ~/.ssh exists"
    ls -ld ~/.ssh
else
    echo "   ❌ ~/.ssh does not exist!"
    exit 1
fi

# Check permissions
echo ""
echo "2. Checking permissions..."
SSH_PERMS=$(stat -c "%a" ~/.ssh 2>/dev/null || stat -f "%OLp" ~/.ssh 2>/dev/null)
if [ "$SSH_PERMS" = "700" ] || [ "$SSH_PERMS" = "drwx------" ]; then
    echo "   ✅ ~/.ssh permissions are correct (700)"
else
    echo "   ⚠️  ~/.ssh permissions: $SSH_PERMS (should be 700)"
    echo "   Fix with: chmod 700 ~/.ssh"
fi

# Check authorized_keys
echo ""
echo "3. Checking authorized_keys file..."
if [ -f ~/.ssh/authorized_keys ]; then
    echo "   ✅ ~/.ssh/authorized_keys exists"
    AUTH_PERMS=$(stat -c "%a" ~/.ssh/authorized_keys 2>/dev/null || stat -f "%OLp" ~/.ssh/authorized_keys 2>/dev/null)
    if [ "$AUTH_PERMS" = "600" ] || [ "$AUTH_PERMS" = "-rw-------" ]; then
        echo "   ✅ authorized_keys permissions are correct (600)"
    else
        echo "   ⚠️  authorized_keys permissions: $AUTH_PERMS (should be 600)"
        echo "   Fix with: chmod 600 ~/.ssh/authorized_keys"
    fi
    
    KEY_COUNT=$(wc -l < ~/.ssh/authorized_keys)
    echo "   📝 Number of authorized keys: $KEY_COUNT"
    
    echo ""
    echo "4. Listing authorized keys (first 100 chars each):"
    cat ~/.ssh/authorized_keys | while read -r line; do
        if [ -n "$line" ] && [[ ! "$line" =~ ^# ]]; then
            KEY_TYPE=$(echo "$line" | awk '{print $1}')
            KEY_FP=$(echo "$line" | awk '{print $2}' | cut -c1-50)
            echo "   - Type: $KEY_TYPE"
            echo "     Fingerprint: ${KEY_FP}..."
        fi
    done
else
    echo "   ❌ ~/.ssh/authorized_keys does not exist!"
    echo "   Create with: touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
    exit 1
fi

# Check SSH server config
echo ""
echo "5. Checking SSH server configuration..."
if [ -f /etc/ssh/sshd_config ]; then
    PUBKEY_AUTH=$(sudo grep -E "^PubkeyAuthentication" /etc/ssh/sshd_config | awk '{print $2}' || echo "not set")
    if [ "$PUBKEY_AUTH" = "yes" ] || [ -z "$PUBKEY_AUTH" ]; then
        echo "   ✅ PubkeyAuthentication is enabled"
    else
        echo "   ❌ PubkeyAuthentication is disabled: $PUBKEY_AUTH"
        echo "   Fix in /etc/ssh/sshd_config: PubkeyAuthentication yes"
    fi
    
    AUTH_KEYS_FILE=$(sudo grep -E "^AuthorizedKeysFile" /etc/ssh/sshd_config | awk '{print $2}' || echo ".ssh/authorized_keys")
    echo "   📝 AuthorizedKeysFile: $AUTH_KEYS_FILE"
else
    echo "   ⚠️  Cannot read /etc/ssh/sshd_config (may need sudo)"
fi

# Check recent SSH log entries
echo ""
echo "6. Recent SSH authentication attempts (last 20 lines):"
if [ -f /var/log/auth.log ]; then
    sudo tail -20 /var/log/auth.log | grep -i "ssh\|publickey" || echo "   (no recent SSH entries)"
elif [ -f /var/log/secure ]; then
    sudo tail -20 /var/log/secure | grep -i "ssh\|publickey" || echo "   (no recent SSH entries)"
else
    echo "   ⚠️  Cannot find auth log (trying journalctl)"
    sudo journalctl -u ssh -n 20 --no-pager 2>/dev/null || echo "   (cannot access logs)"
fi

echo ""
echo "=== Verification Complete ==="
echo ""
echo "Next steps if authentication is failing:"
echo "1. Verify the public key in authorized_keys matches your private key"
echo "2. Check SSH logs for specific error messages"
echo "3. Ensure the username in GitHub secret matches this user: $(whoami)"
echo "4. Test the key locally: ssh -v -i /path/to/key $(whoami)@$(hostname)"
