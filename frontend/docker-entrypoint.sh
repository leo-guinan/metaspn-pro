#!/bin/sh
set -e

echo "Installing dependencies..."
cd /app
pnpm install --frozen-lockfile

echo "Starting application..."
cd /app/frontend
exec "$@"
