# syntax=docker/dockerfile:1.7
# Multi-target image build. Build context: repository root.
#   docker build -f deploy/docker/Dockerfile --target web .
#   docker build -f deploy/docker/Dockerfile --target worker .
#   docker build -f deploy/docker/Dockerfile --target migrate .

ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS base
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

# --- Dependencies (cached unless a manifest or the lockfile changes) ---
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

# --- Build ---
FROM deps AS build
ARG RENTAGENT_VERSION=dev
ENV RENTAGENT_VERSION=${RENTAGENT_VERSION}
COPY . .
RUN pnpm --filter @rentagent/db generate \
 && pnpm --filter @rentagent/web build \
 && pnpm --filter @rentagent/worker build \
 && pnpm --filter @rentagent/db deploy --legacy --prod /out/db

# --- Runtime: database migrations (one-shot) ---
FROM ${NODE_IMAGE} AS migrate
ENV NODE_ENV=production
# The Prisma migration engine requires OpenSSL.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /out/db ./
USER node
CMD ["node_modules/.bin/prisma", "migrate", "deploy"]

# --- Runtime: web (Next.js standalone server) ---
FROM ${NODE_IMAGE} AS web
ARG RENTAGENT_VERSION=dev
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    RENTAGENT_VERSION=${RENTAGENT_VERSION}
WORKDIR /app
# Application code stays root-owned (read-only for the runtime user).
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
RUN mkdir -p /data/files apps/web/.next/cache && chown node:node /data/files apps/web/.next/cache
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "apps/web/server.js"]

# --- Runtime: background worker (single bundled file) ---
FROM ${NODE_IMAGE} AS worker
ARG RENTAGENT_VERSION=dev
ENV NODE_ENV=production \
    RENTAGENT_VERSION=${RENTAGENT_VERSION}
WORKDIR /app
COPY --from=build /repo/apps/worker/dist ./
RUN mkdir -p /data/files && chown node:node /data/files
USER node
CMD ["node", "--enable-source-maps", "index.js"]
