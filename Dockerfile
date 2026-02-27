FROM node:18-alpine

WORKDIR /app

# Copy root workspace config
COPY package.json package-lock.json* tsconfig.base.json ./

# Copy only backend package
COPY packages/backend/ packages/backend/

# Install dependencies
RUN npm install

# Generate Prisma client
RUN cd packages/backend && npx prisma generate

WORKDIR /app/packages/backend

# Railway injects PORT as env var
EXPOSE ${PORT:-3001}

# Run API server and worker concurrently
CMD ["sh", "-c", "npx tsx src/worker.ts & npx tsx src/server.ts"]
