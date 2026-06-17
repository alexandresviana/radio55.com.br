import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { getGravacoesDir } from "@/lib/data-dir";
import { registrarGravacao } from "@/lib/gravacoes-db";
import { isDatabaseConfigured } from "@/lib/db";
import { getActiveRecordingPaths } from "@/lib/recorder";
import { parseMp3Timestamp, resolveRadioFromFilePath } from "@/lib/gravacoes-path";

import { MIN_PLAYABLE_MP3_BYTES } from "@/lib/mp3-integrity";

const INDEX_INTERVAL_MS = 10_000;
const MIN_FILE_BYTES = MIN_PLAYABLE_MP3_BYTES;

type IndexerGlobal = typeof globalThis & {
  __radio55Indexer?: GravacoesIndexer;
};

class GravacoesIndexer {
  private timer?: NodeJS.Timeout;
  private started = false;

  async start(): Promise<void> {
    if (this.started || !isDatabaseConfigured()) return;
    this.started = true;

    await this.scan();
    this.timer = setInterval(() => {
      void this.scan();
    }, INDEX_INTERVAL_MS);
  }

  async scan(): Promise<number> {
    if (!isDatabaseConfigured()) return 0;

    const activePaths = getActiveRecordingPaths();
    let indexed = 0;

    await this.walkDir(getGravacoesDir(), async (filePath) => {
      const synced = await this.syncFile(filePath, activePaths.has(filePath));
      if (synced) indexed += 1;
    });

    return indexed;
  }

  private async walkDir(dir: string, onFile: (filePath: string) => Promise<void>): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.walkDir(fullPath, onFile);
        continue;
      }
      if (!entry.name.endsWith(".mp3")) continue;
      await onFile(fullPath);
    }
  }

  private async syncFile(filePath: string, emGravacao: boolean): Promise<boolean> {
    let fileStat;
    try {
      fileStat = await stat(filePath);
    } catch {
      return false;
    }

    if (fileStat.size < MIN_FILE_BYTES) return false;

    const radio = await resolveRadioFromFilePath(filePath);
    if (!radio) return false;

    const arquivo = path.basename(filePath);
    const gravadoEm = parseMp3Timestamp(arquivo) ?? fileStat.mtime;

    await registrarGravacao({
      municipio: radio.municipio,
      radioNome: radio.nome,
      arquivo,
      caminho: filePath,
      gravadoEm,
      tamanhoBytes: fileStat.size,
      emGravacao,
    });

    return true;
  }
}

function getIndexer(): GravacoesIndexer {
  const globalRef = globalThis as IndexerGlobal;
  if (!globalRef.__radio55Indexer) {
    globalRef.__radio55Indexer = new GravacoesIndexer();
  }
  return globalRef.__radio55Indexer;
}

export async function startGravacoesIndexer(): Promise<void> {
  await getIndexer().start();
}

export async function scanGravacoes(): Promise<number> {
  return getIndexer().scan();
}
