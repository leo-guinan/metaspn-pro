#!/bin/bash

# Quick start script for Docker Compose setup

set -e

echo "🚀 Starting MetaSPN Pro with Docker Compose..."

# Check if .env exists
if [ ! -f .env ]; then
  echo "⚠️  .env file not found. Creating from .env.example..."
  cp .env.example .env
  echo "📝 Please update .env with your API keys before continuing."
  echo ""
  read -p "Press Enter to continue or Ctrl+C to exit and update .env first..."
fi

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "❌ Docker is not running. Please start Docker Desktop and try again."
  exit 1
fi

# Start services
echo "🐳 Starting Docker containers..."
docker-compose up --build
