FROM node:18-slim

WORKDIR /app

# Install OpenSSL (required by Prisma)
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

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

# Copy start script and make executable
COPY packages/backend/start.sh ./start.sh
RUN chmod +x start.sh

# Run API server + worker with auto-restart
CMD ["sh", "./start.sh"]
