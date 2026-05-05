FROM node:18-slim

WORKDIR /app

# OpenSSL + ca-certificates (Prisma + R2/Cloudflare TLS)
RUN apt-get update -y \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# 1) Copy manifests FIRST for cache-friendly npm install
COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages/backend/package.json ./packages/backend/

RUN npm install --no-audit --no-fund

# 2) Copy backend source
COPY packages/backend/ ./packages/backend/

# 3) Prisma client
RUN cd packages/backend && npx prisma generate

# 4) Normalize start.sh line endings (CRLF -> LF) and make executable.
#    Defensive: contributors on Windows can otherwise commit CRLF and break /bin/sh.
RUN sed -i 's/\r$//' packages/backend/start.sh \
 && chmod +x packages/backend/start.sh

WORKDIR /app/packages/backend

EXPOSE ${PORT:-3001}

CMD ["sh", "./start.sh"]
