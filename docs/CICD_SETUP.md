# CI/CD Auto-Deploy Setup Guide

This guide walks through setting up automated deployment from GitHub to your production server.

## Architecture

```
Push to main → GitHub Actions builds image → Push to ghcr.io → SSH to server → Pull & deploy → Health check → Auto-rollback if failed
```

## Prerequisites

- Production server with Docker and Docker Compose installed
- GitHub repository with Actions enabled
- Server accessible via SSH on port 22

## Step 1: Generate SSH Key Pair (Ed25519)

On your local machine, generate a new SSH key pair specifically for deployments:

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/didww-deploy -N ""
```

This creates:
- `~/.ssh/didww-deploy` (private key - keep secret)
- `~/.ssh/didww-deploy.pub` (public key - goes on server)

## Step 2: Configure Production Server

SSH into your production server and set up the deploy user:

```bash
# Create deploy user (if not exists)
sudo useradd -m -s /bin/bash deploy
sudo usermod -aG docker deploy

# Set up SSH authorized keys
sudo mkdir -p /home/deploy/.ssh
sudo chmod 700 /home/deploy/.ssh

# Add the public key (copy content of ~/.ssh/didww-deploy.pub)
echo "YOUR_PUBLIC_KEY_HERE" | sudo tee /home/deploy/.ssh/authorized_keys
sudo chmod 600 /home/deploy/.ssh/authorized_keys
sudo chown -R deploy:deploy /home/deploy/.ssh

# Ensure deploy directory exists and is owned by deploy user
sudo mkdir -p /opt/didww-otp
sudo chown deploy:deploy /opt/didww-otp

# Copy docker-compose.yml and .env to server (first time only)
# scp docker-compose.yml deploy@YOUR_SERVER:/opt/didww-otp/
# scp .env deploy@YOUR_SERVER:/opt/didww-otp/
```

## Step 3: Get SSH Known Hosts

Get the server's host key for GitHub Actions:

```bash
ssh-keyscan -H 95.179.166.168
```

Copy the entire output - you'll need it for the `SSH_KNOWN_HOSTS` secret.

## Step 4: Create GitHub Personal Access Token (for ghcr.io)

1. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token with these scopes:
   - `read:packages` (to pull images)
   - `write:packages` (to push images)
3. Copy the token - you'll need it for the `GHCR_TOKEN` secret

## Step 5: Configure GitHub Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions

Add these repository secrets:

| Secret Name | Value |
|-------------|-------|
| `SSH_PRIVATE_KEY` | Contents of `~/.ssh/didww-deploy` (the private key) |
| `SSH_HOST` | `95.179.166.168` |
| `SSH_USER` | `deploy` |
| `SSH_KNOWN_HOSTS` | Output from `ssh-keyscan` command |
| `GHCR_TOKEN` | GitHub Personal Access Token |

## Step 6: Create Production Environment (Optional but Recommended)

1. Go to repository → Settings → Environments
2. Create new environment called `production`
3. Enable "Required reviewers" if you want manual approval before deploys
4. Add environment protection rules as needed

## Step 7: Initial Server Setup

On the production server, do the initial setup:

```bash
# As deploy user
cd /opt/didww-otp

# Ensure docker-compose.yml and .env are present
ls -la

# Login to GitHub Container Registry (one-time)
# Use your GitHub username and the GHCR_TOKEN
echo "YOUR_GHCR_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

## Step 8: Test the Pipeline

1. Make a small change to the repository
2. Push to the `main` branch
3. Watch the Actions tab for the workflow run
4. Verify deployment on your server

## Rollback Behavior

The deploy script automatically handles rollbacks:

1. Before deploying, it saves the currently running image
2. After deploying, it performs health checks (10 attempts, 6 seconds apart)
3. If health checks fail, it automatically rolls back to the previous image
4. If rollback also fails, manual intervention is required

### Manual Rollback

If you need to manually rollback:

```bash
# SSH to server as deploy user
cd /opt/didww-otp

# List available images
docker images ghcr.io/edwinux/didww-otp

# Deploy a specific version
export DEPLOY_IMAGE=ghcr.io/edwinux/didww-otp:PREVIOUS_SHA
docker compose up -d --no-build
```

## Troubleshooting

### Deployment fails with "permission denied"
- Ensure the deploy user is in the docker group: `sudo usermod -aG docker deploy`
- Re-login or run: `newgrp docker`

### Health check fails
- Check container logs: `docker logs didww-otp-gateway`
- Verify .env file has all required variables
- Check if port 8080 is available

### SSH connection fails
- Verify SSH key is correctly added to server
- Check known_hosts secret matches server
- Ensure firewall allows port 22

### Image pull fails
- Verify GHCR_TOKEN has correct permissions
- Check if docker login was successful on server
- Ensure repository is public or token has read:packages scope
