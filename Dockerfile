# syntax=docker/dockerfile:1
# UniFi Network Dashboard – multi-stage build for Podman/Docker (local, no registry)

ARG NODE_IMAGE=docker.io/library/node:20-alpine

# ---------- 1) Dependencies incl. native better-sqlite3 bindings ----------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
# Build toolchain only in this stage (not in the runtime image)
RUN apk add --no-cache python3 make g++ libc6-compat
COPY package.json package-lock.json ./
# Compiles better-sqlite3 against musl/Alpine if no matching prebuild exists
RUN npm ci --no-audit --no-fund

# ---------- 2) Next.js build (output: standalone) ----------
FROM ${NODE_IMAGE} AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p public && npm run build

# ---------- 3) Slim runtime image ----------
FROM ${NODE_IMAGE} AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/app/data

# Standalone server incl. traced node_modules (better-sqlite3 .node binary)
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

# Writable directories for the non-root user node (UID 1000)
RUN mkdir -p /app/data /app/.next/cache \
 && chown -R node:node /app/data /app/.next/cache

USER node
EXPOSE 3000
VOLUME ["/app/data"]

# Note: Podman only applies HEALTHCHECK with "--format docker"; compose.yaml defines it as well.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
