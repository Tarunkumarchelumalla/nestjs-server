#!/bin/bash

# ===============================
# NestJS Deployment Script
# ===============================

# Exit on any error
set -e

# Project root (adjust if needed)
PROJECT_DIR=$(pwd)
APP_NAME="my-nest-app"

echo "📂 Deploying NestJS app in $PROJECT_DIR"

# 1. Pull latest code (optional)
# git pull origin main

# 2. Install dependencies
echo "📦 Installing dependencies..."
npm install

# 3. Build the project
echo "🛠️  Building NestJS project..."
npm run build

# 4. Start/restart with PM2
echo "🚀 Starting application with PM2..."
if pm2 list | grep -q "$APP_NAME"; then
    pm2 restart $APP_NAME
else
    pm2 start dist/main.js --name $APP_NAME
fi

# 5. Save PM2 process list for startup
pm2 save

pm2 logs $APP_NAME

echo "✅ Deployment complete. Application running as '$APP_NAME'"
