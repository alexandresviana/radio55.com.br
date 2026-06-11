import path from "node:path";

/** Diretório base de dados (emissoras, gravações). No Bunny, monte o volume em /app/data. */
export function getDataDir(): string {
  return process.env.DATA_DIR ?? path.join(process.cwd(), "data");
}

export function getGravacoesDir(): string {
  return path.join(getDataDir(), "gravacoes");
}

export function getTrechosDir(): string {
  return path.join(getDataDir(), "trechos");
}

export function getWhisperCacheDir(): string {
  return path.join(getDataDir(), "whisper-cache");
}
