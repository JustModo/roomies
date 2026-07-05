# ---- Base Stage ----
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN apk add --no-cache libc6-compat

# ---- Pruner Stage ----
FROM base AS pruner
WORKDIR /app
RUN npm install -g turbo
COPY . .
RUN turbo prune web --docker

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
RUN pnpm turbo run build --filter=web

# ---- Runner Stage ----
FROM nginx:1.27-alpine AS runner
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
RUN printf 'server {\n\
  listen 80;\n\
  root /usr/share/nginx/html;\n\
  index index.html;\n\
  location / {\n\
    try_files $uri $uri/ /index.html;\n\
  }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80
