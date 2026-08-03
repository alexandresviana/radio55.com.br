FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Coolify e outros hosts definem NODE_ENV=production no build; devDeps são necessárias para compilar.
RUN npm ci --include=dev

FROM node:20-bookworm-slim AS builder
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
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

# Modelo baixado no build (CI) — no boot copia para o volume, sem depender do Hugging Face
ENV WHISPER_MODEL=base
RUN mkdir -p /app/whisper-cache-builtin \
  && HF_HUB_OFFLINE=0 WHISPER_CACHE_DIR=/app/whisper-cache-builtin \
    /opt/whisper/bin/python /app/scripts/download-whisper-model.py \
  && touch /app/whisper-cache-builtin/.model-ready \
  && chmod -R a+rX /app/whisper-cache-builtin /opt/whisper

ENV WHISPER_PYTHON=/opt/whisper/bin/python
ENV WHISPER_SCRIPT=/app/scripts/transcribe.py
ENV WHISPER_CACHE_DIR=/app/data/whisper-cache
ENV HF_HUB_OFFLINE=1

COPY --from=builder /app/public ./public
# Só seeds JSON — evita copiar gravacoes/trechos locais e caches de import
COPY --from=builder /app/data/emissoras.json /app/data/emissoras.json
COPY --from=builder /app/data/radios-streams.json /app/data/radios-streams.json
COPY --from=builder /app/data/emissoras.json /app/data-seed/emissoras.json
COPY --from=builder /app/data/radios-streams.json /app/data-seed/radios-streams.json
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Não fazer chown -R em /opt/whisper nem no cache do modelo: gera camada enorme
# e costuma estourar disco/tempo no Coolify. Leitura já é world-readable acima.
RUN mkdir -p /app/data/gravacoes /app/data/trechos /app/data/whisper-cache /app/data-seed \
  && chown -R nextjs:nodejs /app/data /app/data-seed

USER nextjs
EXPOSE 3000

ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
CMD ["node", "server.js"]
