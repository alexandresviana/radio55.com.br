FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runner
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app

ARG WHISPER_MODEL=base

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

ENV WHISPER_CACHE_DIR=/opt/whisper-models

RUN mkdir -p /opt/whisper-models \
  && HF_HUB_OFFLINE=0 WHISPER_MODEL="${WHISPER_MODEL}" WHISPER_CACHE_DIR=/opt/whisper-models \
     /opt/whisper/bin/python /app/scripts/download-whisper-model.py

ENV HF_HUB_OFFLINE=1

ENV WHISPER_PYTHON=/opt/whisper/bin/python
ENV WHISPER_SCRIPT=/app/scripts/transcribe.py

COPY --from=builder /app/public ./public
COPY --from=builder /app/data ./data
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

RUN mkdir -p /app/data/gravacoes /app/data/trechos \
  && chown -R nextjs:nodejs /app/data /opt/whisper /opt/whisper-models

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
