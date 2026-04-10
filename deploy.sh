#!/bin/bash
# EVFLO Deployment Script
# Usage: ./deploy.sh frontend | ./deploy.sh middleware

VPS="root@134.199.164.17"
FRONTEND_DIST="frontend/dist"
FRONTEND_REMOTE="/var/www/evflo/"
MIDDLEWARE_LOCAL="middleware/"
MIDDLEWARE_REMOTE="/opt/evflo/middleware/"
LAST_KNOWN_BUNDLE_BYTES=287681

set -e

if [ "$1" == "frontend" ]; then
  echo "=== EVFLO Frontend Deploy ==="
  echo ""

  echo "► Building frontend..."
  cd frontend
  npm run build
  cd ..

  # Check dist exists
  if [ ! -f "$FRONTEND_DIST/index.html" ]; then
    echo "✗ Build failed — dist/index.html not found. Aborting."
    exit 1
  fi

  # Get JS bundle info
  JS_FILE=$(ls $FRONTEND_DIST/assets/index-*.js 2>/dev/null | head -1)
  if [ -z "$JS_FILE" ]; then
    echo "✗ No JS bundle found in dist/assets/. Aborting."
    exit 1
  fi

  JS_SIZE=$(wc -c < "$JS_FILE")
  JS_FILENAME=$(basename "$JS_FILE")
  echo ""
  echo "  Bundle: $JS_FILENAME"
  echo "  Size:   $JS_SIZE bytes (target: ~$LAST_KNOWN_BUNDLE_BYTES bytes)"

  # Warn if bundle is more than 5% smaller than last known production
  THRESHOLD=$(echo "$LAST_KNOWN_BUNDLE_BYTES * 95 / 100" | bc)
  if [ "$JS_SIZE" -lt "$THRESHOLD" ]; then
    echo ""
    echo "⚠️  WARNING: Bundle is more than 5% smaller than last known production bundle."
    echo "   This may indicate missing source files. Investigate before deploying."
    echo ""
    read -p "Deploy anyway? (yes/no): " CONFIRM
    if [ "$CONFIRM" != "yes" ]; then
      echo "Aborted."
      exit 1
    fi
  fi

  echo ""
  read -p "► Deploy to $VPS:$FRONTEND_REMOTE ? (yes/no): " CONFIRM
  if [ "$CONFIRM" != "yes" ]; then
    echo "Aborted."
    exit 1
  fi

  echo ""
  echo "► Uploading..."
  scp -r $FRONTEND_DIST/* $VPS:$FRONTEND_REMOTE

  echo ""
  echo "✓ Frontend deployed."
  echo "  Verify at: https://evflo.com.au"

elif [ "$1" == "middleware" ]; then
  echo "=== EVFLO Middleware Deploy ==="
  echo ""

  read -p "► Deploy middleware to $VPS:$MIDDLEWARE_REMOTE ? (yes/no): " CONFIRM
  if [ "$CONFIRM" != "yes" ]; then
    echo "Aborted."
    exit 1
  fi

  echo ""
  echo "► Uploading middleware files..."
  scp $MIDDLEWARE_LOCAL/api.js $VPS:$MIDDLEWARE_REMOTE
  scp $MIDDLEWARE_LOCAL/index.js $VPS:$MIDDLEWARE_REMOTE
  scp $MIDDLEWARE_LOCAL/ocpp.js $VPS:$MIDDLEWARE_REMOTE
  scp $MIDDLEWARE_LOCAL/db.js $VPS:$MIDDLEWARE_REMOTE
  scp $MIDDLEWARE_LOCAL/package.json $VPS:$MIDDLEWARE_REMOTE

  echo ""
  echo "► Restarting PM2..."
  ssh $VPS "pm2 restart evflo-middleware --update-env"

  echo ""
  echo "► Last 10 log lines:"
  ssh $VPS "pm2 logs evflo-middleware --lines 10 --nostream"

  echo ""
  echo "✓ Middleware deployed. Check logs above for errors."

else
  echo "Usage: ./deploy.sh frontend"
  echo "       ./deploy.sh middleware"
  exit 1
fi