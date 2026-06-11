import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { getGravacoesDir } from "@/lib/data-dir";
import { registrarGravacao } from "@/lib/gravacoes-db";
import { isDatabaseConfigured } from "@/lib/db";
import { parseMp3Timestamp, resolveRadioFromFilePath } from "@/lib/gravacoes-path";

const INDEX_INTERVAL_MS = 20_000;
const MIN_FILE_BYTES = 8_192;

type IndexerGlobal = typeof globalThis & {
  __radio55Indexer?: GravacoesIndexer;
};

class GravacoesIndexer {
  private timer?: NodeJS.Timeout;
  private knownSizes = new Map<string, number>();
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

    let indexed = 0;
    await this.walkDir(getGravacoesDir(), async (filePath) => {
      const added = await this.registerIfReady(filePath);
      if (added) indexed += 1;
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

  private async registerIfReady(filePath: string): Promise<boolean> {
    let fileStat;
    try {
      fileStat = await stat(filePath);
    } catch {
      return false;
    }

    if (fileStat.size < MIN_FILE_BYTES) return false;

    const previousSize = this.knownSizes.get(filePath);
    this.knownSizes.set(filePath, fileStat.size);

    if (previousSize === undefined || previousSize !== fileStat.size) {
      return false;
    }

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
