# ---- Base Stage ----
FROM node:22-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
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

# ---- Pruner Stage ----
FROM base AS pruner
WORKDIR /app
RUN npm install -g turbo
COPY . .
RUN turbo prune @roomies/server @roomies/web --docker

# ---- Builder Stage ----
FROM base AS builder
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .
# Generate dummy prisma for build
RUN cd apps/api && DATABASE_URL="file:./dummy.db" npx prisma generate
RUN pnpm turbo run build --filter=@roomies/server --filter=@roomies/web

# Extract only production dependencies and built files for the backend
RUN pnpm deploy --legacy --filter=@roomies/server --prod /app/deploy/server
RUN cd /app/deploy/server && DATABASE_URL="file:./dummy.db" npx prisma generate

# ---- Runner Stage ----
FROM base AS runner
WORKDIR /app

# Install Caddy
COPY --from=caddy:2 /usr/bin/caddy /usr/bin/caddy

# Set up runner environment
ENV NODE_ENV=production
ENV ROOMIES_CONFIG_PATH=/config/roomies.conf
EXPOSE 5123

# Copy the deployed production backend
COPY --from=builder /app/deploy/server /app/apps/api
# Copy the built frontend
COPY --from=builder /app/apps/web/dist /app/apps/web/dist

# Copy Caddyfile and scripts
COPY infra/caddy/Caddyfile /etc/caddy/Caddyfile
COPY infra/scripts/docker-entrypoint.sh /docker-entrypoint.sh
COPY infra/scripts/docker-cmd.sh /docker-cmd.sh
RUN chmod +x /docker-entrypoint.sh /docker-cmd.sh

WORKDIR /app/apps/api
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["/docker-cmd.sh"]
