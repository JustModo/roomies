# ---- Builder Stage ----
FROM node:22-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace manifests first for better layer caching
COPY pnpm-workspace.yaml turbo.json ./
COPY package.json pnpm-lock.yaml ./

# Copy package.json files for all workspaces
COPY packages/contracts/package.json packages/contracts/
COPY packages/shared/package.json packages/shared/
COPY packages/config/package.json packages/config/
COPY packages/logger/package.json packages/logger/
COPY apps/api/package.json apps/api/

# Install all deps
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/ packages/
COPY apps/api/ apps/api/

# Build the API
RUN pnpm --filter api build

# ---- Runner Stage ----
FROM node:22-alpine AS runner

# Install ffmpeg (system binary for child_process calls)
RUN apk add --no-cache ffmpeg

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace structure needed for module resolution
COPY pnpm-workspace.yaml turbo.json ./
COPY package.json pnpm-lock.yaml ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/shared/package.json packages/shared/
COPY packages/config/package.json packages/config/
COPY packages/logger/package.json packages/logger/
COPY apps/api/package.json apps/api/

# Install production deps only
RUN pnpm install --frozen-lockfile --prod

# Copy built output and package source (contracts/shared are source-only)
COPY --from=builder /app/apps/api/dist apps/api/dist
COPY --from=builder /app/packages packages/

# Prisma client needs schema to run migrations
COPY apps/api/prisma apps/api/prisma

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "apps/api/dist/index.js"]
