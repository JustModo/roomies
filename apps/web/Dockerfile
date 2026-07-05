# ---- Builder Stage ----
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY pnpm-workspace.yaml turbo.json ./
COPY package.json pnpm-lock.yaml ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/shared/package.json packages/shared/
COPY packages/config/package.json packages/config/
COPY packages/logger/package.json packages/logger/
COPY apps/web/package.json apps/web/

RUN pnpm install --frozen-lockfile

COPY packages/ packages/
COPY apps/web/ apps/web/

RUN pnpm --filter web build

# ---- Runner Stage ----
FROM nginx:1.27-alpine AS runner

# Copy built React app
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# SPA fallback: all routes → index.html
RUN printf 'server {\n\
  listen 80;\n\
  root /usr/share/nginx/html;\n\
  index index.html;\n\
  location / {\n\
    try_files $uri $uri/ /index.html;\n\
  }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80
