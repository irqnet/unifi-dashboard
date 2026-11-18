# syntax=docker/dockerfile:1
# UniFi Network Dashboard – Multi-Stage-Build für Podman/Docker (lokal, ohne Registry)

ARG NODE_IMAGE=docker.io/library/node:20-alpine

# ---------- 1) Abhängigkeiten inkl. nativer better-sqlite3-Bindings ----------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
# Build-Toolchain nur in dieser Stage (nicht im Runtime-Image)
RUN apk add --no-cache python3 make g++ libc6-compat
COPY package.json package-lock.json ./
# Kompiliert better-sqlite3 gegen musl/Alpine, falls kein passendes Prebuild existiert
RUN npm ci --no-audit --no-fund

# ---------- 2) Next.js-Build (output: standalone) ----------
FROM ${NODE_IMAGE} AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p public && npm run build

# ---------- 3) Schlankes Runtime-Image ----------
FROM ${NODE_IMAGE} AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/app/data

# Standalone-Server inkl. getraceter node_modules (better-sqlite3 .node-Binary)
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

# Schreibbare Verzeichnisse für Non-Root-User node (UID 1000)
RUN mkdir -p /app/data /app/.next/cache \
 && chown -R node:node /app/data /app/.next/cache

USER node
EXPOSE 3000
VOLUME ["/app/data"]

# Hinweis: Podman übernimmt HEALTHCHECK nur bei "--format docker"; compose.yaml definiert ihn zusätzlich.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
