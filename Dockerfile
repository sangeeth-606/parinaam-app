# syntax=docker/dockerfile:1
#
# Parinaam — self-hosted backend (PostgreSQL) container.
#
# Two targets, both locked (`npm ci` from package-lock.json):
#
#   --target server  → production image: API only (server/ + shared src/types),
#                      non-root, production deps (pg) + a runtime-only tree.
#   --target test    → full workspace incl. dev dependencies, for `npm test`
#                      and the typecheck gates inside CI/compose.
#
#   docker build --target server -t parinaam-server .
#   docker build --target test   -t parinaam-test   .
#
# The image never contains the ledger database, .env files, or the camera-engine
# workspace (see .dockerignore); the API reaches PostgreSQL over DATABASE_URL.

# ---------------------------------------------------------------- base (shared)
FROM node:22-bookworm-slim AS base
ENV NODE_ENV=production \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false \
    EXPO_OFFLINE=1
WORKDIR /app
# tini gives the API a real PID 1 so SIGTERM shuts it down cleanly.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*
ENTRYPOINT ["/usr/bin/tini", "--"]

# ---------------------------------------------------------------- deps (prod)
FROM base AS deps-prod
# .npmrc (legacy-peer-deps) is part of the install contract: the React Native /
# Expo peer graph does not resolve under npm's strict peer rules.
COPY package.json package-lock.json .npmrc ./
# postinstall (scripts/patch-react-native.js) runs during npm ci, so the scripts
# directory must be present *before* install. The script is existence-guarded and
# idempotent; in this prod stage it only touches RN package files it may need later.
COPY --chown=node:node scripts/patch-react-native.js ./scripts/patch-react-native.js
# `npm ci` is the lockfile contract; omit=dev keeps only runtime deps (pg, ...).
RUN npm ci --omit=dev && npm cache clean --force

# ---------------------------------------------------------------- server (prod)
FROM deps-prod AS server
ENV PARINAAM_API_PORT=8571
# Only what the API actually needs: server sources plus the shared, node-safe
# modules they import (src/contracts, src/crypto, src/demo, src/types — all pure
# TS with no React Native dependency). src/demo backs the PARINAAM_SEED demo
# dataset, so the server image can seed PostgreSQL on first boot.
COPY --chown=node:node server ./server
COPY --chown=node:node src/contracts ./src/contracts
COPY --chown=node:node src/crypto ./src/crypto
COPY --chown=node:node src/demo ./src/demo
COPY --chown=node:node src/types ./src/types
COPY --chown=node:node scripts ./scripts
# Run unprivileged (node:node = uid/gid 1000, already present in the base image).
USER node
EXPOSE 8571
# /api/v1/health → {ok:true,…}
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PARINAAM_API_PORT||8571)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--experimental-strip-types", "server/src/main.ts"]

# ---------------------------------------------------------------- test (dev deps)
FROM base AS test
ENV NODE_ENV=development \
    EXPO_OFFLINE=1 \
    CI=1
COPY package.json package-lock.json .npmrc ./
# postinstall (scripts/patch-react-native.js) runs during npm ci, so it must exist
# before install; the full workspace is copied right after, which fills scripts/.
COPY --chown=node:node scripts/patch-react-native.js ./scripts/patch-react-native.js
# Full install (dev deps included) for the test + typecheck gates.
RUN npm ci && npm cache clean --force
# Test target runs on the whole workspace.
COPY --chown=node:node . .
RUN chmod +x scripts/*.sh 2>/dev/null || true \
  && mkdir -p build .scratch data \
  && chown -R node:node build .scratch data
USER node
# Default: the full node:test suite.
CMD ["npm", "test"]
