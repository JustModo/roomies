# ---- Base Stage ----
# Debian-slim rather than Alpine: Debian's ffmpeg package is built with VAAPI
# support, which Alpine's is not, so hardware-accelerated encoding
# (packages/transcoding/src/hwaccel.ts) can actually activate on hosts with a
# VAAPI-capable GPU and /dev/dri passed through (see docker-compose.yml).
# NVENC/QSV still won't work here — those need proprietary headers Debian's
# default build doesn't ship — hwaccel detection safely falls back to CPU.
FROM node:22-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
# python3/make/g++ are required to compile better-sqlite3's native binding if
# no prebuilt binary is available for this platform.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg openssl ca-certificates python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

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
