# SSH Authentication Debugging Guide

If your GitHub Actions deployment is failing with SSH authentication errors, follow these steps:

## Error: `ssh: unable to authenticate, attempted methods [none publickey]`

This means the SSH key isn't being accepted by the server. Here's how to debug:

## Step 1: Verify Key Format in GitHub Secrets

The `PRODUCTION_SSH_KEY` secret must contain the **full private key** including headers:

```
-----BEGIN OPENSSH PRIVATE KEY-----
[base64 encoded key content]
-----END OPENSSH PRIVATE KEY-----
```

Or for RSA keys:
```
-----BEGIN RSA PRIVATE KEY-----
[base64 encoded key content]
-----END RSA PRIVATE KEY-----
```

**Common mistakes:**
- Missing the header/footer lines
- Only copying part of the key
- Extra whitespace or line breaks in the middle

## Step 2: Verify Public Key on Server

SSH into your server and check the authorized_keys file:

```bash
# SSH into server (using password or another key that works)
ssh your_user@your_server_ip

# Check authorized_keys
cat ~/.ssh/authorized_keys

# Verify the public key matches your private key
# The public key should start with: ssh-ed25519, ssh-rsa, or ecdsa-sha2-nistp256
```

## Step 3: Verify File Permissions on Server

SSH key files must have correct permissions:

```bash
# On the server, run:
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
chmod 600 ~/.ssh/id_*  # if you have private keys on server
```

## Step 4: Test Key Locally

Test the key from your local machine:

```bash
# Test SSH connection with verbose output
ssh -v -i ~/.ssh/your_private_key your_user@your_server_ip

# Or if using default key location:
ssh -v your_user@your_server_ip
```

Look for:
- `Offering public key` - key is being offered
- `Server accepts key` - key is accepted
- `Permission denied` - key is rejected

## Step 5: Generate a New Key Pair (If Needed)

If the key isn't working, generate a new one **without a passphrase** for GitHub Actions:

```bash
# Generate Ed25519 key (recommended)
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_actions_deploy -N ""

# This creates:
# ~/.ssh/github_actions_deploy (private key - add to GitHub secret)
# ~/.ssh/github_actions_deploy.pub (public key - add to server)
```

## Step 6: Add Public Key to Server

```bash
# Copy public key to server
cat ~/.ssh/github_actions_deploy.pub | ssh your_user@your_server_ip "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"

# Or manually:
# 1. Copy the public key content
cat ~/.ssh/github_actions_deploy.pub

# 2. SSH into server
ssh your_user@your_server_ip

# 3. Add to authorized_keys
echo "PASTE_PUBLIC_KEY_HERE" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

## Step 7: Update GitHub Secret

1. Copy the **full private key** (including headers):
   ```bash
   cat ~/.ssh/github_actions_deploy
   ```

2. Go to GitHub → Settings → Secrets and variables → Actions
3. Update `PRODUCTION_SSH_KEY` with the full private key content
4. Make sure there are no extra spaces or line breaks

## Step 8: Verify SSH Config on Server

Check SSH server configuration:

```bash
# On server, check SSH config
sudo cat /etc/ssh/sshd_config | grep -E "PubkeyAuthentication|AuthorizedKeysFile|PasswordAuthentication"

# Should see:
# PubkeyAuthentication yes
# AuthorizedKeysFile .ssh/authorized_keys
# PasswordAuthentication no (or yes if you want password fallback)
```

## Step 9: Check SSH Logs on Server

If still failing, check server logs:

```bash
# On server, check SSH logs
sudo tail -f /var/log/auth.log

# Or on some systems:
sudo journalctl -u ssh -f
```

Look for authentication attempts when GitHub Actions runs.

## Step 10: Test with GitHub Actions Debug

The workflow now includes a "Test SSH connection" step that runs before deployment. Check the logs for:
- Connection attempts
- Key offering
- Authentication success/failure

## Common Issues

1. **Key has passphrase**: GitHub Actions can't enter passphrases. Generate a key without one.
2. **Wrong key format**: Must be OpenSSH format, not PEM or other formats.
3. **Key in wrong secret**: Make sure it's in `PRODUCTION_SSH_KEY`, not a different secret name.
4. **Username mismatch**: Verify `PRODUCTION_USER` matches the actual server username.
5. **Port mismatch**: Verify `PRODUCTION_SSH_PORT` matches the server's SSH port (default 22).

## Quick Test Script

Run this on your server to verify everything is set up:

```bash
#!/bin/bash
echo "=== SSH Configuration Check ==="
echo "SSH directory permissions:"
ls -ld ~/.ssh
echo ""
echo "Authorized keys file permissions:"
ls -l ~/.ssh/authorized_keys
echo ""
echo "Number of authorized keys:"
wc -l ~/.ssh/authorized_keys
echo ""
echo "SSH server config:"
sudo grep -E "PubkeyAuthentication|AuthorizedKeysFile" /etc/ssh/sshd_config
```
