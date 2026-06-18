import { access, stat, unlink } from "node:fs/promises";
import {
  buildBunnyRemotePath,
  getBunnyStorageConfig,
  isBunnyStorageConfigured,
  uploadFileToBunnyStorage,
} from "@/lib/bunny-storage";
import { isDatabaseConfigured } from "@/lib/db";
import {
  listarGravacoesPendentesUpload,
  marcarGravacaoEnviadaStorage,
  obterGravacaoPorCaminho,
  type GravacaoPendenteUpload,
} from "@/lib/gravacoes-db";
import { MIN_PLAYABLE_MP3_BYTES } from "@/lib/mp3-integrity";
import { getActiveRecordingPaths } from "@/lib/recorder";

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const MIN_FILE_BYTES = MIN_PLAYABLE_MP3_BYTES;
const STABLE_AGE_MS = 60_000;

type UploaderGlobal = typeof globalThis & {
  __radio55BunnyUploader?: BunnyStorageUploaderService;
};

async function getFileStat(
  filePath: string,
  exigirEstavel: boolean,
): Promise<{ size: number; mtimeMs: number } | null> {
  try {
    await access(filePath);
    const first = await stat(filePath);
    if (!exigirEstavel) {
      return { size: first.size, mtimeMs: first.mtimeMs };
    }

    if (Date.now() - first.mtimeMs < STABLE_AGE_MS) return null;

    const second = await stat(filePath);
    if (second.size !== first.size || second.mtimeMs !== first.mtimeMs) return null;

    return { size: second.size, mtimeMs: second.mtimeMs };
  } catch {
    return null;
  }
}

export async function uploadGravacaoArquivo(
  gravacao: GravacaoPendenteUpload,
  opts?: { exigirEstavel?: boolean },
): Promise<string | null> {
  if (!isDatabaseConfigured() || !isBunnyStorageConfigured()) return null;

  const activePaths = getActiveRecordingPaths();
  if (activePaths.has(gravacao.caminho) || gravacao.em_gravacao) return null;

  const fileStat = await getFileStat(gravacao.caminho, opts?.exigirEstavel ?? false);
  if (!fileStat || fileStat.size < MIN_FILE_BYTES) return null;

  const config = getBunnyStorageConfig();
  if (!config) return null;

  const remotePath = buildBunnyRemotePath([
    config.pathPrefix,
    gravacao.municipio,
    gravacao.radio_nome,
    gravacao.arquivo,
  ]);

  const uploaded = await uploadFileToBunnyStorage({
    localPath: gravacao.caminho,
    remotePath,
  });

  await marcarGravacaoEnviadaStorage(gravacao.id, uploaded.remotePath, uploaded.sizeBytes);

  if (process.env.BUNNY_STORAGE_DELETE_LOCAL_AFTER_UPLOAD === "true") {
    await unlink(gravacao.caminho).catch(() => {});
  }

  console.info(`[bunny-storage] enviado ${remotePath} (${uploaded.sizeBytes} bytes)`);
  return uploaded.remotePath;
}

class BunnyStorageUploaderService {
  private started = false;
  private busy = false;
  private timer?: NodeJS.Timeout;
  private lastRunAt: string | null = null;
  private lastError: string | null = null;
  private uploadedTotal = 0;
  private lastUploadedPath: string | null = null;

  async start(): Promise<void> {
    if (this.started || !isDatabaseConfigured() || !isBunnyStorageConfigured()) {
      if (!isBunnyStorageConfigured()) {
        console.warn("[bunny-storage] Variáveis ausentes — upload desativado");
      }
      return;
    }

    this.started = true;
    const intervalMs = Number(process.env.BUNNY_STORAGE_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);

    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, Math.max(intervalMs, 60_000));
  }

  getStatus() {
    return {
      ativo: this.started,
      ocupado: this.busy,
      erro: this.lastError,
      ultima_execucao: this.lastRunAt,
      enviados_total: this.uploadedTotal,
      ultimo_arquivo: this.lastUploadedPath,
      configurado: isBunnyStorageConfigured(),
      zona: getBunnyStorageConfig()?.zone ?? null,
    };
  }

  private async tick(): Promise<void> {
    if (this.busy || !isDatabaseConfigured() || !isBunnyStorageConfigured()) return;

    this.busy = true;
    try {
      const pendentes = await listarGravacoesPendentesUpload(15);

      for (const gravacao of pendentes) {
        const uploaded = await uploadGravacaoArquivo(gravacao, { exigirEstavel: true });
        if (uploaded) {
          this.uploadedTotal += 1;
          this.lastUploadedPath = uploaded;
          this.lastError = null;
        }
      }

      this.lastRunAt = new Date().toISOString();
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : "Erro no upload Bunny Storage";
      console.error("[bunny-storage]", this.lastError);
    } finally {
      this.busy = false;
    }
  }
}

export function getBunnyStorageUploaderStatus() {
  const globalRef = globalThis as UploaderGlobal;
  return (
    globalRef.__radio55BunnyUploader?.getStatus() ?? {
      ativo: false,
      ocupado: false,
      erro: null,
      ultima_execucao: null,
      enviados_total: 0,
      ultimo_arquivo: null,
      configurado: isBunnyStorageConfigured(),
      zona: getBunnyStorageConfig()?.zone ?? null,
    }
  );
}

export async function startBunnyStorageUploader(): Promise<void> {
  const globalRef = globalThis as UploaderGlobal;
  if (!globalRef.__radio55BunnyUploader) {
    globalRef.__radio55BunnyUploader = new BunnyStorageUploaderService();
  }
  await globalRef.__radio55BunnyUploader.start();
}

export async function tentarUploadGravacaoPorCaminho(caminho: string): Promise<string | null> {
  const gravacao = await obterGravacaoPorCaminho(caminho);
  if (!gravacao || gravacao.em_gravacao || gravacao.arquivo_valido === false) return null;
  if (gravacao.bunny_uploaded_em) return gravacao.bunny_path;

  return uploadGravacaoArquivo(
    {
      id: gravacao.id,
      municipio: gravacao.municipio,
      radio_nome: gravacao.radio_nome,
      arquivo: gravacao.arquivo,
      caminho: gravacao.caminho,
      tamanho_bytes: gravacao.tamanho_bytes,
      em_gravacao: gravacao.em_gravacao,
    },
    { exigirEstavel: false },
  );
}
