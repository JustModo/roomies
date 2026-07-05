# ---- Builder Stage ----
FROM node:22-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# ── 1. Copy workspace manifests for layer caching ──────────────────────────
COPY pnpm-workspace.yaml turbo.json ./
COPY package.json pnpm-lock.yaml ./

# Copy package.json files (needed before pnpm install for workspace resolution)
COPY packages/contracts/package.json  packages/contracts/
COPY packages/shared/package.json     packages/shared/
COPY packages/config/package.json     packages/config/
COPY packages/logger/package.json     packages/logger/
COPY apps/api/package.json            apps/api/

# ── 2. Install all workspace dependencies ─────────────────────────────────
RUN pnpm install --frozen-lockfile

# ── 3. Copy all source code + package tsconfigs ───────────────────────────
COPY packages/ packages/
COPY apps/api/ apps/api/

# ── 4. Build shared package (tsc: src/ → dist/) ───────────────────────────
RUN pnpm --filter @roomies/shared build

# ── 5. Build contracts package (tsc: src/ → dist/) ────────────────────────
RUN pnpm --filter @roomies/contracts build

# ── 6. Generate Prisma client ─────────────────────────────────────────────
RUN cd apps/api && DATABASE_URL="postgresql://dummy:dummy@dummy:5432/dummy" npx prisma generate

# ── 7. Build the API (tsc: src/ → dist/) ─────────────────────────────────
RUN pnpm --filter api build

# ---- Runner Stage ----
FROM node:22-alpine AS runner

# Install ffmpeg for child_process calls
RUN apk add --no-cache ffmpeg

# API's working directory for the rest of its life
WORKDIR /app/apps/api

# ── Copy node_modules (hoisted workspace root + api-local) ────────────────
COPY --from=builder /app/node_modules          /app/node_modules
COPY --from=builder /app/apps/api/node_modules ./node_modules

# ── Copy compiled API output (dist/ only — node runs JS, not TS) ──────────
COPY --from=builder /app/apps/api/dist         ./dist

# ── Copy compiled packages (dist/ only) ───────────────────────────────────
COPY --from=builder /app/packages/contracts/dist     /app/packages/contracts/dist
COPY --from=builder /app/packages/contracts/package.json /app/packages/contracts/package.json
COPY --from=builder /app/packages/contracts/node_modules /app/packages/contracts/node_modules
COPY --from=builder /app/packages/shared/dist        /app/packages/shared/dist
COPY --from=builder /app/packages/shared/package.json    /app/packages/shared/package.json

# ── Copy other packages (config/logger are likely header-only or empty) ───
COPY --from=builder /app/packages/config   /app/packages/config
COPY --from=builder /app/packages/logger   /app/packages/logger

# ── Copy workspace root manifests (needed by Node module resolution) ───────
COPY --from=builder /app/package.json        /app/package.json
COPY --from=builder /app/pnpm-workspace.yaml /app/pnpm-workspace.yaml

# ── Copy API manifest + Prisma schema ─────────────────────────────────────
COPY --from=builder /app/apps/api/package.json     ./package.json
COPY --from=builder /app/apps/api/prisma           ./prisma
COPY --from=builder /app/apps/api/prisma.config.ts ./prisma.config.ts

ENV NODE_ENV=production

EXPOSE 3000

# Sync schema then start with plain node (no tsx, no transpilation at runtime)
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node dist/index.js"]
