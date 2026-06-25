#!/bin/bash
set -e

SERVER="bayleaf"
USER="root"
REMOTE_PATH="/var/www/crackk.ai"
BUILD_DIR="dist"

echo "Building..."
npm install
npm run build

echo "Deploying to $SERVER:$REMOTE_PATH..."
rsync -avz --delete "$BUILD_DIR"/ "$USER@$SERVER:$REMOTE_PATH/"

echo "Done."