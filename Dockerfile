FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000

RUN apk add --no-cache ffmpeg && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/data ./data
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Volume persistente: monte em /app/data (emissoras + MP3 gravados)
RUN mkdir -p /app/data/gravacoes && chown -R nextjs:nodejs /app/data

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
