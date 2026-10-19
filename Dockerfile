# syntax=docker/dockerfile:1
# Production image. Deployment notes: docs/deploy.md.
FROM node:22.22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22.22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && npm run build:scripts

FROM node:22.22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 MIGRATIONS_DIR=/app/db/migrations
RUN groupadd --system app && useradd --system --gid app --home /app app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/db/migrations ./db/migrations
COPY --from=build --chown=app:app /app/scripts/migrate.ts /app/scripts/migrate.ts
COPY --from=build --chown=app:app /app/scripts/lib/migrate.ts /app/scripts/lib/migrate.ts
# Demo deployments only (refused unless ALLOW_DEMO_SEED=true): reset to fresh demo data.
COPY --from=build --chown=app:app /app/dist-scripts/demo-reset.mjs /app/scripts/demo-reset.mjs
COPY --chown=app:app docker-entrypoint.sh ./
# Only used with STORAGE_DRIVER=local (development, or a mounted volume).
RUN mkdir -p /app/.storage && chown app:app /app/.storage
# No USER line: the entrypoint starts as root only to prepare a mounted volume,
# then drops to the app user before running anything else.
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
