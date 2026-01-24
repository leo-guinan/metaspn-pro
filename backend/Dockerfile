FROM node:20-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.15.9 --activate

# Set working directory
WORKDIR /app

# Copy root package files (needed for pnpm workspace)
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./

# Copy backend package.json
COPY backend/package.json ./backend/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy backend source code
COPY backend/ ./backend/

# Copy entrypoint script
COPY backend/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Set working directory to backend
WORKDIR /app/backend

# Expose port
EXPOSE 3001

# Set entrypoint
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

# Default command (can be overridden in docker-compose)
CMD ["pnpm", "run", "dev"]
