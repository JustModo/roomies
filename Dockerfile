# ---- Base Stage ----
FROM node:22-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN apt-get update && apt-get install -y --no-install-recommends \
  wget gnupg ca-certificates curl \
  && mkdir -p /etc/apt/keyrings \
  && curl -fsSL https://repo.jellyfin.org/jellyfin_team.gpg.key | gpg --dearmor -o /etc/apt/keyrings/jellyfin.gpg \
  && echo "deb [arch=$( dpkg --print-architecture ) signed-by=/etc/apt/keyrings/jellyfin.gpg] https://repo.jellyfin.org/debian bookworm main" | tee /etc/apt/sources.list.d/jellyfin.list \
  && apt-get update && apt-get install -y --no-install-recommends \
  jellyfin-ffmpeg6 intel-media-va-driver va-driver-all \
  openssl python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# ---- Pruner Stage ----
FROM base AS pruner
WORKDIR /app
RUN npm install -g turbo
COPY . .
RUN turbo prune @roomies/server @roomies/web --docker

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
RUN pnpm turbo run build --filter=@roomies/server --filter=@roomies/web

# ---- Runner Stage ----
FROM base AS runner
WORKDIR /app

# Install Caddy
COPY --from=caddy:2 /usr/bin/caddy /usr/bin/caddy

# Copy the pruned and built workspace
COPY --from=builder /app .


# Set up runner environment
WORKDIR /app/apps/api
ENV NODE_ENV=production
EXPOSE 5123

# Set Config Path explicitly for the App
ENV ROOMIES_CONFIG_PATH=/config/roomies.conf

# Copy Caddyfile from host context
COPY infra/caddy/Caddyfile /etc/caddy/Caddyfile

# Start scripts
COPY infra/scripts/docker-entrypoint.sh /docker-entrypoint.sh
COPY infra/scripts/docker-cmd.sh /docker-cmd.sh
RUN chmod +x /docker-entrypoint.sh /docker-cmd.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["/docker-cmd.sh"]
