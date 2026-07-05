FROM node:18-alpine AS builder
WORKDIR /app
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY packages ./packages/
RUN npm install -g pnpm && pnpm install --frozen-lockfile
COPY apps/api ./apps/api/
RUN pnpm --filter api run build

FROM node:18-alpine AS runner
WORKDIR /app
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/package.json ./
CMD ["node", "dist/index.js"]
