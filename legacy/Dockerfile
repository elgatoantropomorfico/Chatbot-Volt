# syntax=docker/dockerfile:1.7
# Base bumped to bookworm-slim (different digest) to FORCE the remote BuildKit
# to drop the previously poisoned cache layers that kept failing with
# `failed to calculate checksum of ref ... "/packages/backend": not found`.
FROM node:20-bookworm-slim

# ARG used purely as a cache-bust knob. Bump this value if the remote
# builder ever poisons its cache again.
ARG CACHE_BUST=2026-05-05-1
RUN echo "cache-bust: ${CACHE_BUST}"

WORKDIR /srv/app

# OpenSSL + ca-certificates: required by Prisma and outbound TLS (Cloudflare R2, OpenAI, Zoho)
RUN apt-get update -y \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# 1) Copy the entire monorepo manifests + backend manifest first (small, cache-friendly).
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/backend/package.json packages/backend/package.json

# 2) Install dependencies for the whole workspace.
RUN npm install --no-audit --no-fund --loglevel=error

# 3) Copy backend source.
COPY packages/backend ./packages/backend

# 4) Sanity-check the context made it in (fails the build LOUDLY if not, instead
#    of producing the cryptic BuildKit cache-key error).
RUN test -d ./packages/backend \
 && test -f ./packages/backend/start.sh \
 && test -f ./packages/backend/src/server.ts \
 && test -f ./packages/backend/src/worker.ts

# 5) Prisma client.
RUN cd packages/backend && npx prisma generate

# 6) Normalize start.sh line endings (CRLF -> LF) and make it executable.
#    Defense against Windows committers — without this, /bin/sh fails on \r.
RUN sed -i 's/\r$//' packages/backend/start.sh \
 && chmod +x packages/backend/start.sh

WORKDIR /srv/app/packages/backend

EXPOSE 3001

CMD ["sh", "./start.sh"]
