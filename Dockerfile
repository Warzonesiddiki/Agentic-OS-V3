# Stage 1: Build stage
FROM node:20-alpine AS build
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

# Install native compilation build dependencies (better-sqlite3 needs python3 + make + g++)
RUN apk add --no-cache python3 make g++

# Copy workspace manifests first for optimal layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY server/package.json ./server/package.json
COPY packages/*/package.json ./packages/
COPY nexus-tauri/package.json ./nexus-tauri/package.json

# Install the full workspace. This repo is a pnpm workspace with workspace:* deps,
# so npm cannot resolve the dependency graph (use pnpm).
RUN pnpm install --frozen-lockfile || pnpm install

COPY . .

# Regenerate Drizzle migrations from schema (non-fatal if schema unchanged)
WORKDIR /app/server
RUN pnpm run db:generate || true

# Build shared packages first (server runtime imports @agentic-os/a2a-server -> dist),
# then the server itself.
RUN pnpm -r --filter "./packages/*" build
RUN pnpm run build

# Rebuild native modules against the production Node ABI
RUN pnpm rebuild better-sqlite3 || npm rebuild better-sqlite3

# Stage 2: Production runtime stage
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Install curl for health check + ca-certificates for TLS outbound
RUN apk add --no-cache curl ca-certificates

# Prepare runtime directory and permissions for non-root node user
RUN mkdir -p /app/data && chown -R node:node /app

COPY --chown=node:node --from=build /app/server/node_modules ./node_modules
COPY --chown=node:node --from=build /app/server/dist ./dist
COPY --chown=node:node --from=build /app/server/package.json ./package.json
COPY --chown=node:node --from=build /app/server/drizzle ./drizzle
COPY --chown=node:node --from=build /app/packages ./packages
COPY --chown=node:node entrypoint.sh ./entrypoint.sh

RUN chmod +x ./entrypoint.sh

# Security hardening: run as non-root user node
USER node

EXPOSE 9900

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:9900/api/v1/health || exit 1

ENTRYPOINT ["./entrypoint.sh"]
CMD ["node", "dist/index.js"]