#!/bin/bash
set -e

SERVER="heracross"
USER="root"
REMOTE_PATH="/var/www/crackk.ai"
BUILD_DIR="dist"

echo "Clearing old build"
rm -rf dist

echo "Building..."
npm install
npm run build

echo "Deploying to $SERVER:$REMOTE_PATH..."
rsync -avz --delete "$BUILD_DIR"/ "$USER@$SERVER:$REMOTE_PATH/"

echo "Done."