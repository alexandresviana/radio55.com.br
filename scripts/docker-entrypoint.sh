#!/bin/sh
set -e

DATA_DIR="${DATA_DIR:-/app/data}"
mkdir -p "${DATA_DIR}/gravacoes" "${DATA_DIR}/trechos" "${DATA_DIR}/whisper-cache"

if [ ! -f "${DATA_DIR}/emissoras.json" ] && [ -f /app/data-seed/emissoras.json ]; then
  echo "[entrypoint] Seed inicial de emissoras.json em ${DATA_DIR}..."
  cp /app/data-seed/emissoras.json "${DATA_DIR}/emissoras.json"
elif [ -f /app/data-seed/emissoras.json ] && [ -f "${DATA_DIR}/emissoras.json" ]; then
  SEED_COUNT=$(python3 -c "import json; print(len(json.load(open('/app/data-seed/emissoras.json'))))")
  DATA_COUNT=$(python3 -c "import json; print(len(json.load(open('${DATA_DIR}/emissoras.json'))))")
  if [ "${SEED_COUNT}" -gt "${DATA_COUNT}" ]; then
    echo "[entrypoint] emissoras.json desatualizado (${DATA_COUNT} -> ${SEED_COUNT} municípios); mesclando no boot..."
    python3 <<PY
import json, sys
data_dir = "${DATA_DIR}"
paths = [f"{data_dir}/emissoras.json", "/app/data-seed/emissoras.json"]
atual, seed = (json.load(open(p)) for p in paths)
merged = dict(atual)
for nome, dados in seed.items():
    if nome not in merged:
        merged[nome] = dados
out = f"{data_dir}/emissoras.json"
json.dump(merged, open(out, "w"), ensure_ascii=False, indent=2)
open(out, "a").write("\n")
print(f"[entrypoint] emissoras.json atualizado: {len(atual)} -> {len(merged)} municípios", file=sys.stderr)
PY
  fi
fi

DEFAULT_MODEL_DIR="/app/data/whisper-cache"
BUILTIN_MODEL_DIR="/app/whisper-cache-builtin"
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

ensure_model() {
  if [ -f "${MODEL_FLAG}" ]; then
    return 0
  fi

  if [ -f "${BUILTIN_MODEL_DIR}/.model-ready" ]; then
    echo "[entrypoint] Copiando modelo embutido para ${MODEL_DIR}..."
    cp -a "${BUILTIN_MODEL_DIR}/." "${MODEL_DIR}/"
    touch "${MODEL_FLAG}"
    echo "[entrypoint] Modelo Whisper copiado do cache embutido."
    return 0
  fi

  echo "[entrypoint] Baixando modelo Whisper (${WHISPER_MODEL:-base})..."
  if HF_HUB_OFFLINE=0 \
    WHISPER_MODEL="${WHISPER_MODEL:-base}" \
    WHISPER_CACHE_DIR="${MODEL_DIR}" \
    /opt/whisper/bin/python /app/scripts/download-whisper-model.py; then
    touch "${MODEL_FLAG}"
    echo "[entrypoint] Modelo Whisper pronto em ${MODEL_DIR}."
    return 0
  fi

  echo "[entrypoint] AVISO: modelo Whisper indisponível. App inicia; transcrição fica pausada."
  return 1
}

ensure_model || true

if [ -f "${MODEL_FLAG}" ]; then
  export HF_HUB_OFFLINE=1
else
  export HF_HUB_OFFLINE=0
fi

export WHISPER_CACHE_DIR="${MODEL_DIR}"

exec "$@"
