import { access, stat } from "node:fs/promises";
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
} from "@/lib/gravacoes-db";
import { getActiveRecordingPaths } from "@/lib/recorder";

const DEFAULT_INTERVAL_MS = 30 * 60 * 1000;
const MIN_FILE_BYTES = 64 * 1024;
const STABLE_AGE_MS = 5 * 60 * 1000;

type UploaderGlobal = typeof globalThis & {
  __radio55BunnyUploader?: BunnyStorageUploaderService;
};

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
      const activePaths = getActiveRecordingPaths();
      const pendentes = await listarGravacoesPendentesUpload(10);

      for (const gravacao of pendentes) {
        if (activePaths.has(gravacao.caminho)) continue;

        const fileStat = await this.getStableFileStat(gravacao.caminho);
        if (!fileStat || fileStat.size < MIN_FILE_BYTES) continue;

        const config = getBunnyStorageConfig();
        if (!config) break;

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

        await marcarGravacaoEnviadaStorage(gravacao.id, uploaded.remotePath);
        this.uploadedTotal += 1;
        this.lastUploadedPath = uploaded.remotePath;
        this.lastError = null;
      }

      this.lastRunAt = new Date().toISOString();
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : "Erro no upload Bunny Storage";
      console.error("[bunny-storage]", this.lastError);
    } finally {
      this.busy = false;
    }
  }

  private async getStableFileStat(
    filePath: string,
  ): Promise<{ size: number; mtimeMs: number } | null> {
    try {
      await access(filePath);
      const first = await stat(filePath);
      if (Date.now() - first.mtimeMs < STABLE_AGE_MS) return null;

      const second = await stat(filePath);
      if (second.size !== first.size || second.mtimeMs !== first.mtimeMs) return null;

      return { size: second.size, mtimeMs: second.mtimeMs };
    } catch {
      return null;
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
