# syntax=docker/dockerfile:1.7
FROM node:20-bookworm-slim

# Cache-bust knob: bump if the remote BuildKit ever poisons its cache and
# starts failing with `failed to calculate checksum of ref ... not found`.
ARG CACHE_BUST=2026-05-05-2
RUN echo "cache-bust: ${CACHE_BUST}"

WORKDIR /srv/app

# OpenSSL + ca-certificates: Prisma + outbound TLS (Cloudflare R2, OpenAI, Zoho)
RUN apt-get update -y \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# 1) Manifests first (cache-friendly npm install).
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/backend/package.json packages/backend/package.json

# 2) Install all dependencies for the workspace (incl. dev deps for build).
RUN npm install --no-audit --no-fund --loglevel=error

# 3) Backend source.
COPY packages/backend ./packages/backend

# 4) Loud sanity check (better than the cryptic BuildKit checksum error).
RUN test -d ./packages/backend \
 && test -f ./packages/backend/start.sh \
 && test -f ./packages/backend/src/server.ts \
 && test -f ./packages/backend/src/worker.ts

# 5) Build: Prisma client + transpile TS to dist/ (no type-check; tracked
#    type errors are fixed via `npm run typecheck` separately).
RUN cd packages/backend && npm run build

# 6) Normalize line endings on start.sh (defense against Windows CRLF) + chmod.
RUN sed -i 's/\r$//' packages/backend/start.sh \
 && chmod +x packages/backend/start.sh

WORKDIR /srv/app/packages/backend

EXPOSE 3001

CMD ["sh", "./start.sh"]
