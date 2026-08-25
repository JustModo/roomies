# Base stage
FROM node:22-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
RUN apt-get update && apt-get install -y --no-install-recommends \
  wget gnupg ca-certificates curl \
  && mkdir -p /etc/apt/keyrings \
  && curl -fsSL https://repo.jellyfin.org/jellyfin_team.gpg.key | gpg --dearmor -o /etc/apt/keyrings/jellyfin.gpg \
  && echo "deb [arch=$( dpkg --print-architecture ) signed-by=/etc/apt/keyrings/jellyfin.gpg] https://repo.jellyfin.org/debian bookworm main" | tee /etc/apt/sources.list.d/jellyfin.list \
  && apt-get update && apt-get install -y --no-install-recommends \
  jellyfin-ffmpeg7 intel-media-va-driver va-driver-all \
  openssl \
  && apt-get purge -y wget gnupg curl \
  && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/*
ENV PATH="/usr/lib/jellyfin-ffmpeg:$PATH"

# Pruner stage
FROM base AS pruner
WORKDIR /app
RUN npm install -g turbo
COPY . .
RUN turbo prune @roomies/server @roomies/web --docker

# Builder stage
FROM base AS builder
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .
# Generate Prisma client for build
RUN cd apps/api && DATABASE_URL="file:./dummy.db" npx prisma generate
RUN pnpm turbo run build --filter=@roomies/server --filter=@roomies/web

# Deploy production backend dependencies
RUN pnpm deploy --filter=@roomies/server --prod /app/deploy/server
RUN cd /app/deploy/server && DATABASE_URL="file:./dummy.db" npx prisma generate

# Runner stage
FROM base AS runner
WORKDIR /app

# Install Caddy
COPY --from=caddy:2 /usr/bin/caddy /usr/bin/caddy

# Set up environment
ENV NODE_ENV=production
ENV ROOMIES_CONFIG_PATH=/config/roomies.conf
EXPOSE 5123

# Health check via Caddy endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5123/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Copy deployed backend and built frontend assets
COPY --from=builder /app/deploy/server /app/apps/api
COPY --from=builder /app/apps/web/dist /app/apps/web/dist

# Copy Caddyfile and entrypoint scripts
COPY infra/caddy/Caddyfile /etc/caddy/Caddyfile
COPY infra/scripts/docker-entrypoint.sh /docker-entrypoint.sh
COPY infra/scripts/docker-cmd.sh /docker-cmd.sh
RUN chmod +x /docker-entrypoint.sh /docker-cmd.sh

WORKDIR /app/apps/api
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["/docker-cmd.sh"]
