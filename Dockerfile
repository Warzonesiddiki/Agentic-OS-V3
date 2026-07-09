# Stage 1: Build stage
FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /app

# Install native compilation build dependencies if needed
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json* pnpm-lock.yaml* ./
COPY server/package.json ./server/package.json

RUN npm ci || npm install

COPY . .

WORKDIR /app/server
RUN npm run db:generate || true
RUN npm run build

# Stage 2: Production runtime stage
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Install curl for health check
RUN apk add --no-cache curl

# Prepare runtime directory and permissions for non-root node user
RUN mkdir -p /app/data && chown -R node:node /app

COPY --chown=node:node --from=build /app/server/node_modules ./node_modules
COPY --chown=node:node --from=build /app/server/dist ./dist
COPY --chown=node:node --from=build /app/server/package.json ./package.json
COPY --chown=node:node --from=build /app/server/drizzle ./drizzle
COPY --chown=node:node entrypoint.sh ./entrypoint.sh

RUN chmod +x ./entrypoint.sh

# Security hardening: run as non-root user node
USER node

EXPOSE 9900

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:9900/api/v1/health || exit 1

ENTRYPOINT ["./entrypoint.sh"]
CMD ["node", "dist/index.js"]
