#!/bin/sh
set -e

MODEL_DIR="${WHISPER_CACHE_DIR:-/app/data/whisper-cache}"
MODEL_FLAG="${MODEL_DIR}/.model-ready"

mkdir -p "${MODEL_DIR}"

if [ ! -f "${MODEL_FLAG}" ]; then
  echo "[entrypoint] Baixando modelo Whisper (${WHISPER_MODEL:-base})..."
  HF_HUB_OFFLINE=0 \
    WHISPER_MODEL="${WHISPER_MODEL:-base}" \
    WHISPER_CACHE_DIR="${MODEL_DIR}" \
    /opt/whisper/bin/python /app/scripts/download-whisper-model.py
  touch "${MODEL_FLAG}"
  echo "[entrypoint] Modelo Whisper pronto."
fi

export HF_HUB_OFFLINE=1
export WHISPER_CACHE_DIR="${MODEL_DIR}"

exec "$@"
