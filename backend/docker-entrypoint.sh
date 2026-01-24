#!/bin/sh
set -e

echo "Installing dependencies..."
cd /app
pnpm install --frozen-lockfile

# For Mastra dev, we need dependencies in backend/node_modules
# Copy required packages to backend/node_modules to satisfy Mastra's path expectations
if [ "$1" = "pnpm" ] && [ "$2" = "run" ] && [ "$3" = "dev:mastra" ]; then
  echo "Setting up node_modules for Mastra..."
  mkdir -p /app/backend/node_modules
  
  # Copy @mastra packages from root node_modules
  if [ -d "/app/node_modules/@mastra" ]; then
    echo "Copying @mastra packages..."
    cp -r /app/node_modules/@mastra /app/backend/node_modules/ 2>/dev/null || true
  fi
  
  # Also copy other dependencies that Mastra might need
  for pkg in "@anthropic-ai" "@hono" "zod" "openai"; do
    if [ -d "/app/node_modules/$pkg" ] && [ ! -d "/app/backend/node_modules/$pkg" ]; then
      cp -r "/app/node_modules/$pkg" /app/backend/node_modules/ 2>/dev/null || true
    fi
  done
  
  # Clean Mastra build output to force rebuild with current dependencies
  echo "Cleaning Mastra build output..."
  rm -rf /app/backend/.mastra 2>/dev/null || true
fi

echo "Starting application..."
cd /app/backend
exec "$@"
