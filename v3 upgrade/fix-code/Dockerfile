FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/drizzle ./drizzle
# Browser automation requires real Chromium plus OS dependencies. This is
# intentionally in the runtime image because Playwright stores browser assets
# outside node_modules by default.
RUN npx playwright install --with-deps chromium
EXPOSE 9900
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:9900/api/v1/health || exit 1
CMD ["node", "dist/index.js"]
