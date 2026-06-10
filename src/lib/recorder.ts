import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { readEmissoras } from "@/lib/emissoras";
import { getRadioStream, makeStreamKey } from "@/lib/radios-streams";

const RECORDINGS_DIR = path.join(process.cwd(), "data", "gravacoes");
const RETENTION_MS = 24 * 60 * 60 * 1000;
const SEGMENT_SECONDS = 3600;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const SYNC_INTERVAL_MS = 5 * 60 * 1000;
const RESTART_DELAY_MS = 15_000;

export interface RecordingStatus {
  key: string;
  municipio: string;
  nome: string;
  ativo: boolean;
  streamUrl: string | null;
  diretorio: string;
  arquivos: number;
  ultimoArquivo: string | null;
  erro: string | null;
}

type RecorderGlobal = typeof globalThis & {
  __radio55Recorder?: RecorderService;
};

function safeDirName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "radio";
}

class RecorderService {
  private processes = new Map<string, ChildProcess>();
  private errors = new Map<string, string>();
  private cleanupTimer?: NodeJS.Timeout;
  private syncTimer?: NodeJS.Timeout;
  private started = false;

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    await mkdir(RECORDINGS_DIR, { recursive: true });
    await this.sync();
    await this.cleanup();

    this.cleanupTimer = setInterval(() => {
      void this.cleanup();
    }, CLEANUP_INTERVAL_MS);

    this.syncTimer = setInterval(() => {
      void this.sync();
    }, SYNC_INTERVAL_MS);
  }

  async sync(): Promise<void> {
    const emissoras = await readEmissoras();
    const desired = new Set<string>();

    for (const [municipio, data] of Object.entries(emissoras)) {
      for (const radio of data.radios) {
        if (!radio.gravar) continue;

        const key = makeStreamKey(municipio, radio.nome);
        desired.add(key);

        if (!this.processes.has(key)) {
          await this.startOne(municipio, radio.nome);
        }
      }
    }

    for (const key of this.processes.keys()) {
      if (!desired.has(key)) {
        this.stopOne(key);
        this.errors.delete(key);
      }
    }
  }

  private async startOne(municipio: string, nome: string): Promise<void> {
    const key = makeStreamKey(municipio, nome);
    const info = await getRadioStream(municipio, nome);

    if (!info?.streamUrl) {
      this.errors.set(key, "Stream não disponível no radios.com.br");
      return;
    }

    const outputDir = path.join(RECORDINGS_DIR, safeDirName(municipio), safeDirName(nome));
    await mkdir(outputDir, { recursive: true });

    const outputPattern = path.join(outputDir, "%Y%m%d-%H%M%S.mp3");
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-user_agent",
      "Mozilla/5.0 (compatible; radio55-recorder/1.0)",
      "-reconnect",
      "1",
      "-reconnect_streamed",
      "1",
      "-reconnect_delay_max",
      "5",
    ];

    if (info.streamUrl.startsWith("https://")) {
      args.push("-tls_verify", "0");
    }

    args.push(
      "-i",
      info.streamUrl,
      "-c:a",
      "libmp3lame",
      "-b:a",
      "96k",
      "-f",
      "segment",
      "-segment_time",
      String(SEGMENT_SECONDS),
      "-strftime",
      "1",
      "-reset_timestamps",
      "1",
      outputPattern,
    );

    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    this.errors.delete(key);

    proc.stderr?.on("data", (chunk: Buffer) => {
      const message = chunk.toString().trim();
      if (message) this.errors.set(key, message.slice(-200));
    });

    proc.on("exit", (code, signal) => {
      this.processes.delete(key);

      if (signal === "SIGTERM" || signal === "SIGKILL") return;

      this.errors.set(
        key,
        code === 0 ? "Gravação encerrada" : `ffmpeg saiu com código ${code ?? "desconhecido"}`,
      );

      setTimeout(() => {
        void this.sync();
      }, RESTART_DELAY_MS);
    });

    this.processes.set(key, proc);
  }

  private stopOne(key: string): void {
    const proc = this.processes.get(key);
    if (!proc) return;
    proc.kill("SIGTERM");
    this.processes.delete(key);
  }

  async cleanup(): Promise<number> {
    const cutoff = Date.now() - RETENTION_MS;
    let removed = 0;

    async function walk(dir: string): Promise<void> {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          await walk(fullPath);
          continue;
        }

        if (!entry.name.endsWith(".mp3")) continue;

        const fileStat = await stat(fullPath);
        if (fileStat.mtimeMs < cutoff) {
          await unlink(fullPath);
          removed += 1;
        }
      }
    }

    try {
      await walk(RECORDINGS_DIR);
    } catch {
      // diretório ainda não existe
    }

    return removed;
  }

  async getStatus(): Promise<RecordingStatus[]> {
    const emissoras = await readEmissoras();
    const statuses: RecordingStatus[] = [];

    for (const [municipio, data] of Object.entries(emissoras)) {
      for (const radio of data.radios) {
        if (!radio.gravar) continue;

        const key = makeStreamKey(municipio, radio.nome);
        const info = await getRadioStream(municipio, radio.nome);
        const outputDir = path.join(
          RECORDINGS_DIR,
          safeDirName(municipio),
          safeDirName(radio.nome),
        );
        const files = await this.listMp3Files(outputDir);

        statuses.push({
          key,
          municipio,
          nome: radio.nome,
          ativo: this.processes.has(key),
          streamUrl: info?.streamUrl ?? null,
          diretorio: outputDir,
          arquivos: files.length,
          ultimoArquivo: files.at(-1) ?? null,
          erro: this.errors.get(key) ?? null,
        });
      }
    }

    return statuses.sort((a, b) => a.municipio.localeCompare(b.municipio, "pt-BR"));
  }

  private async listMp3Files(dir: string): Promise<string[]> {
    try {
      const entries = await readdir(dir);
      return entries.filter((name) => name.endsWith(".mp3")).sort();
    } catch {
      return [];
    }
  }
}

function getService(): RecorderService {
  const globalRef = globalThis as RecorderGlobal;
  if (!globalRef.__radio55Recorder) {
    globalRef.__radio55Recorder = new RecorderService();
  }
  return globalRef.__radio55Recorder;
}

export async function startRecorderService(): Promise<void> {
  await getService().start();
}

export async function syncRecordings(): Promise<void> {
  await getService().sync();
}

export async function getRecordingStatus(): Promise<RecordingStatus[]> {
  return getService().getStatus();
}
