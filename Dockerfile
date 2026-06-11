FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runner
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    python3-venv \
  && rm -rf /var/lib/apt/lists/* \
  && python3 -m venv /opt/whisper \
  && /opt/whisper/bin/pip install --no-cache-dir faster-whisper \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY scripts ./scripts
RUN chmod +x /app/scripts/docker-entrypoint.sh \
  && chown -R nextjs:nodejs /app/scripts

ENV WHISPER_PYTHON=/opt/whisper/bin/python
ENV WHISPER_SCRIPT=/app/scripts/transcribe.py
ENV WHISPER_CACHE_DIR=/app/data/whisper-cache
ENV HF_HUB_OFFLINE=1

COPY --from=builder /app/public ./public
COPY --from=builder /app/data ./data
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

RUN mkdir -p /app/data/gravacoes /app/data/trechos /app/data/whisper-cache \
  && chown -R nextjs:nodejs /app/data /opt/whisper

USER nextjs
EXPOSE 3000

ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
CMD ["node", "server.js"]
