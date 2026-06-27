FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
# Generate migrations from the schema (no live DB needed for `generate`),
# so the drizzle/ folder exists for the runtime image and migrations.
RUN npm run db:generate || echo "migration generation skipped"
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/drizzle ./drizzle
EXPOSE 9900
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:9900/api/v1/health || exit 1
CMD ["node", "dist/index.js"]
