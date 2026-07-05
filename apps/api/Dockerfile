# ---- Base Stage ----
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
# python3/make/g++ are required to compile better-sqlite3's native binding on
# musl libc (alpine), which usually has no prebuilt binary available.
RUN apk add --no-cache libc6-compat openssl ffmpeg python3 make g++

# ---- Pruner Stage ----
FROM base AS pruner
WORKDIR /app
RUN npm install -g turbo
COPY . .
RUN turbo prune api --docker

# ---- Installer Stage ----
FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

# ---- Builder Stage ----
FROM base AS builder
WORKDIR /app
COPY --from=installer /app/ .
COPY --from=pruner /app/out/full/ .
RUN cd apps/api && DATABASE_URL="file:./dummy.db" npx prisma generate
RUN pnpm turbo run build --filter=api

# ---- Runner Stage ----
FROM base AS runner
WORKDIR /app

# Copy the pruned and built workspace
COPY --from=builder /app .

WORKDIR /app/apps/api
ENV NODE_ENV=production
EXPOSE 3000

# Run migrations and start the server
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node dist/index.js"]
