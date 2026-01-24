FROM node:20-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.15.9 --activate

# Set working directory
WORKDIR /app

# Copy root package files (needed for pnpm workspace)
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./

# Copy frontend package.json
COPY frontend/package.json ./frontend/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy frontend source code
COPY frontend/ ./frontend/

# Copy entrypoint script
COPY frontend/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Set working directory to frontend
WORKDIR /app/frontend

# Expose port
EXPOSE 3000

# Set entrypoint
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

# Default command (can be overridden in docker-compose)
CMD ["pnpm", "run", "dev"]
