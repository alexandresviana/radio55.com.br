#!/bin/sh
set -e

DEFAULT_MODEL_DIR="/app/data/whisper-cache"
MODEL_DIR="${WHISPER_CACHE_DIR:-$DEFAULT_MODEL_DIR}"

# /opt não é gravável pelo usuário nextjs — comum se a env antiga ainda estiver no Bunny
case "${MODEL_DIR}" in
  /opt/*)
    echo "[entrypoint] WHISPER_CACHE_DIR=${MODEL_DIR} ignorado (sem permissão). Usando ${DEFAULT_MODEL_DIR}."
    MODEL_DIR="${DEFAULT_MODEL_DIR}"
    ;;
esac

if ! mkdir -p "${MODEL_DIR}" 2>/dev/null; then
  echo "[entrypoint] Não foi possível criar ${MODEL_DIR}. Usando ${DEFAULT_MODEL_DIR}."
  MODEL_DIR="${DEFAULT_MODEL_DIR}"
  mkdir -p "${MODEL_DIR}"
fi

MODEL_FLAG="${MODEL_DIR}/.model-ready"

if [ ! -f "${MODEL_FLAG}" ]; then
  echo "[entrypoint] Baixando modelo Whisper (${WHISPER_MODEL:-base})..."
  HF_HUB_OFFLINE=0 \
    WHISPER_MODEL="${WHISPER_MODEL:-base}" \
    WHISPER_CACHE_DIR="${MODEL_DIR}" \
    /opt/whisper/bin/python /app/scripts/download-whisper-model.py
  touch "${MODEL_FLAG}"
  echo "[entrypoint] Modelo Whisper pronto em ${MODEL_DIR}."
fi

export HF_HUB_OFFLINE=1
export WHISPER_CACHE_DIR="${MODEL_DIR}"

exec "$@"
