#!/bin/bash

# Deploy changes to Synology NAS
# Update these variables with your NAS details
NAS_IP="192.168.1.70"
NAS_USER="rheritage"
NAS_PATH="/volume1/docker/gif-library"

echo "Deploying changes to NAS at $NAS_IP..."

# Copy backend changes
echo "Copying backend files..."
scp -r backend/ $NAS_USER@$NAS_IP:$NAS_PATH/

# Copy docker-compose and env files
echo "Copying configuration files..."
scp docker-compose.yml $NAS_USER@$NAS_IP:$NAS_PATH/
scp .env $NAS_USER@$NAS_IP:$NAS_PATH/

# Rebuild and restart on NAS
echo "Rebuilding and restarting services on NAS..."
ssh $NAS_USER@$NAS_IP "cd $NAS_PATH && docker compose build backend && docker compose up -d"

echo "Deployment complete! Check http://$NAS_IP:8087/browse"