# SSH Key Authentication Setup Guide

This guide walks you through setting up SSH key authentication on your Hetzner server. **This is critical** - the setup script will disable password authentication, so you must have SSH keys working first.

## Prerequisites

- A Hetzner server with Ubuntu 24.04 LTS installed
- Your local machine (Mac, Linux, or Windows with WSL)
- Terminal/command line access

## Step 1: Check if You Already Have an SSH Key

On your **local machine**, check if you already have an SSH key:

```bash
# Check for existing SSH keys
ls -la ~/.ssh/id_*.pub
```

If you see files like `id_rsa.pub`, `id_ed25519.pub`, or `id_ecdsa.pub`, you already have a key. **Skip to Step 3**.

If you see "No such file or directory", continue to Step 2.

## Step 2: Generate a New SSH Key (If Needed)

Generate a new SSH key pair on your **local machine**:

```bash
# Generate Ed25519 key (recommended - more secure and faster)
ssh-keygen -t ed25519 -C "your_email@example.com"

# Or if your system doesn't support Ed25519, use RSA:
# ssh-keygen -t rsa -b 4096 -C "your_email@example.com"
```

**When prompted:**
- **File location**: Press Enter to accept default (`~/.ssh/id_ed25519`)
- **Passphrase**: 
  - **Recommended**: Enter a strong passphrase (you'll need this when using the key)
  - **Optional**: Press Enter twice for no passphrase (less secure but more convenient)

You should see output like:
```
Generating public/private ed25519 key pair.
Enter file in which to save the key (/Users/yourname/.ssh/id_ed25519): [Press Enter]
Enter passphrase (empty for no passphrase): [Enter passphrase or press Enter]
Enter same passphrase again: [Repeat passphrase or press Enter]
Your identification has been saved in /Users/yourname/.ssh/id_ed25519
Your public key has been saved in /Users/yourname/.ssh/id_ed25519.pub
```

## Step 3: Get Your Public Key

Display your public key (you'll copy this to the server):

```bash
# Display your public key
cat ~/.ssh/id_ed25519.pub

# Or if you used RSA:
# cat ~/.ssh/id_rsa.pub
```

**Copy the entire output** - it should look like:
```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... your_email@example.com
```

Or for RSA:
```
ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQC... your_email@example.com
```

## Step 4: Add Key to Hetzner Cloud (Recommended Method)

### Option A: Add Key During Server Creation (Easiest)

If you're creating a new server:

1. In Hetzner Cloud Console, go to **Security** → **SSH Keys**
2. Click **Add SSH Key**
3. Paste your public key
4. Give it a name (e.g., "My Laptop")
5. Click **Add SSH Key**
6. When creating the server, select this SSH key
7. The key will be automatically added to the `root` user

### Option B: Add Key to Existing Server

If your server already exists:

1. In Hetzner Cloud Console, go to **Security** → **SSH Keys**
2. Click **Add SSH Key**
3. Paste your public key
4. Give it a name
5. Click **Add SSH Key**
6. Go to your server → **Rescue** tab
7. Enable Rescue Mode (this will reboot the server)
8. SSH into rescue mode and add the key manually (see Step 5)

## Step 5: Add Key to Server Manually

If Hetzner Cloud didn't add it automatically, or you want to add it to a specific user:

### For Root User (Initial Setup)

```bash
# SSH into your server with password (if still enabled)
ssh root@your-server-ip

# Create .ssh directory if it doesn't exist
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# Add your public key to authorized_keys
echo "YOUR_PUBLIC_KEY_HERE" >> ~/.ssh/authorized_keys

# Set correct permissions
chmod 600 ~/.ssh/authorized_keys

# Verify it was added
cat ~/.ssh/authorized_keys
```

**Important:** Replace `YOUR_PUBLIC_KEY_HERE` with the actual public key you copied in Step 3.

### For Metaspn User (After Setup Script)

After running `setup-server.sh`, add your key to the `metaspn` user:

```bash
# As root or with sudo
sudo mkdir -p /home/metaspn/.ssh
sudo chmod 700 /home/metaspn/.ssh

# Add your public key
echo "YOUR_PUBLIC_KEY_HERE" | sudo tee -a /home/metaspn/.ssh/authorized_keys

# Set correct permissions
sudo chmod 600 /home/metaspn/.ssh/authorized_keys
sudo chown -R metaspn:metaspn /home/metaspn/.ssh

# Verify
sudo cat /home/metaspn/.ssh/authorized_keys
```

## Step 6: Test SSH Key Authentication

**Before running setup-server.sh**, test that your SSH key works:

```bash
# Test connection (will use your SSH key automatically)
ssh root@your-server-ip

# Or if you set a passphrase, you'll be prompted for it
```

**What should happen:**
- ✅ If no passphrase: You connect immediately
- ✅ If passphrase set: You're prompted for the passphrase (not the server password)
- ❌ If it asks for password: Your key isn't set up correctly

### Troubleshooting Connection Issues

If you get "Permission denied (publickey)":

1. **Check key is added correctly:**
   ```bash
   ssh root@your-server-ip -v
   # Look for: "Offering public key: /Users/yourname/.ssh/id_ed25519"
   ```

2. **Verify permissions on server:**
   ```bash
   # On server
   ls -la ~/.ssh/
   # Should show:
   # drwx------ .ssh
   # -rw------- authorized_keys
   ```

3. **Check SSH agent (if using passphrase):**
   ```bash
   # Add key to SSH agent
   ssh-add ~/.ssh/id_ed25519
   
   # Verify it's added
   ssh-add -l
   ```

4. **Try specifying key explicitly:**
   ```bash
   ssh -i ~/.ssh/id_ed25519 root@your-server-ip
   ```

## Step 7: Add Key to SSH Config (Optional but Recommended)

Create/edit `~/.ssh/config` on your **local machine** for easier access:

```bash
# Create or edit SSH config
nano ~/.ssh/config
# or
vim ~/.ssh/config
```

Add this configuration:

```
Host metaspn-prod
    HostName your-server-ip
    User root
    IdentityFile ~/.ssh/id_ed25519
    IdentitiesOnly yes

Host metaspn-prod-user
    HostName your-server-ip
    User metaspn
    IdentityFile ~/.ssh/id_ed25519
    IdentitiesOnly yes
```

**Replace `your-server-ip` with your actual server IP.**

Now you can connect with:
```bash
# As root
ssh metaspn-prod

# As metaspn user (after setup)
ssh metaspn-prod-user
```

## Step 8: Verify Before Running Setup Script

**Critical:** The `setup-server.sh` script will disable password authentication. Make sure your SSH key works first!

```bash
# Test connection
ssh root@your-server-ip

# Once connected, test that you can run commands
whoami
# Should output: root

# Exit
exit

# Test again (to make sure it works consistently)
ssh root@your-server-ip
exit
```

**Only proceed to run `setup-server.sh` once you've confirmed SSH key authentication works!**

## Step 9: After Setup Script Runs

After `setup-server.sh` completes, it will:
- ✅ Disable password authentication
- ✅ Create `metaspn` user
- ✅ Add `metaspn` to docker group

**Add your SSH key to the `metaspn` user:**

```bash
# SSH as root (using your key)
ssh root@your-server-ip

# Add your public key to metaspn user
sudo mkdir -p /home/metaspn/.ssh
echo "YOUR_PUBLIC_KEY_HERE" | sudo tee -a /home/metaspn/.ssh/authorized_keys
sudo chmod 700 /home/metaspn/.ssh
sudo chmod 600 /home/metaspn/.ssh/authorized_keys
sudo chown -R metaspn:metaspn /home/metaspn/.ssh

# Test connection as metaspn user
exit
ssh metaspn@your-server-ip
```

## Security Best Practices

1. **Use Ed25519 keys** (more secure than RSA)
2. **Set a passphrase** on your private key
3. **Never share your private key** (`~/.ssh/id_ed25519`) - only share the public key
4. **Use SSH agent** to avoid typing passphrase repeatedly:
   ```bash
   # Add to agent
   ssh-add ~/.ssh/id_ed25519
   
   # Add to agent on macOS (persists across reboots)
   # Add to ~/.ssh/config:
   Host *
       AddKeysToAgent yes
       UseKeychain yes
   ```
5. **Keep your private key secure** - treat it like a password
6. **Use different keys for different servers** (optional but recommended)

## Troubleshooting

### "Permission denied (publickey)"

**Causes:**
- Key not added to server
- Wrong permissions on server
- Wrong key file specified

**Solutions:**
1. Verify key is in `~/.ssh/authorized_keys` on server
2. Check permissions: `chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys`
3. Use `-v` flag for verbose output: `ssh -v root@your-server-ip`

### "Too many authentication failures"

**Cause:** SSH is trying multiple keys

**Solution:**
```bash
# Specify key explicitly
ssh -i ~/.ssh/id_ed25519 root@your-server-ip

# Or add to ~/.ssh/config:
IdentitiesOnly yes
```

### "Host key verification failed"

**Cause:** Server was reinstalled or key changed

**Solution:**
```bash
# Remove old host key
ssh-keygen -R your-server-ip

# Or edit ~/.ssh/known_hosts and remove the line for your-server-ip
```

### Can't connect after setup script runs

**Cause:** Password auth disabled but key not working

**Solution:**
1. Use Hetzner Cloud Console → Server → **Rescue** mode
2. Boot into rescue system
3. Mount your disk and fix SSH config
4. Or use Hetzner Cloud Console → **VNC Console** to access server directly

## Quick Reference

```bash
# Generate key
ssh-keygen -t ed25519 -C "your_email@example.com"

# Display public key
cat ~/.ssh/id_ed25519.pub

# Test connection
ssh root@your-server-ip

# Add key to server (as root)
echo "YOUR_PUBLIC_KEY" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

# Add key to metaspn user (after setup)
sudo mkdir -p /home/metaspn/.ssh
echo "YOUR_PUBLIC_KEY" | sudo tee -a /home/metaspn/.ssh/authorized_keys
sudo chmod 700 /home/metaspn/.ssh
sudo chmod 600 /home/metaspn/.ssh/authorized_keys
sudo chown -R metaspn:metaspn /home/metaspn/.ssh
```

## Next Steps

Once SSH key authentication is working:

1. ✅ Test connection multiple times
2. ✅ Run `./scripts/setup-server.sh`
3. ✅ Add key to `metaspn` user
4. ✅ Continue with deployment steps in [DEPLOYMENT.md](./DEPLOYMENT.md)
