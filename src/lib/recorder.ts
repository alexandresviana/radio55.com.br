import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { getGravacoesDir } from "@/lib/data-dir";
import { readEmissoras } from "@/lib/emissoras";
import { finalizarGravacao, marcarGravacaoRemovida } from "@/lib/gravacoes-db";
import { FFMPEG_LIVE_INPUT_FLAGS, isBenignFfmpegMessage } from "@/lib/ffmpeg-audio";
import { formatRecordingFilename, radioOutputDir } from "@/lib/gravacoes-path";
import { getRadioStream, makeStreamKey } from "@/lib/radios-streams";

const RECORDINGS_DIR = getGravacoesDir();
const RETENTION_MS = 24 * 60 * 60 * 1000;
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
  arquivoAtual: string | null;
  tamanhoAtualBytes: number | null;
  erro: string | null;
}

type RecorderGlobal = typeof globalThis & {
  __radio55Recorder?: RecorderService;
};

class RecorderService {
  private processes = new Map<string, ChildProcess>();
  private activeFiles = new Map<string, string>();
  private activeFileSizes = new Map<string, number>();
  private errors = new Map<string, string>();
  private cleanupTimer?: NodeJS.Timeout;
  private syncTimer?: NodeJS.Timeout;
  private sizeTimer?: NodeJS.Timeout;
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

    this.sizeTimer = setInterval(() => {
      void this.refreshActiveFileSizes();
    }, 10_000);
  }

  getActivePaths(): Set<string> {
    return new Set(this.activeFiles.values());
  }

  private async refreshActiveFileSizes(): Promise<void> {
    for (const [key, filePath] of this.activeFiles.entries()) {
      try {
        const fileStat = await stat(filePath);
        this.activeFileSizes.set(key, fileStat.size);
      } catch {
        this.activeFileSizes.delete(key);
      }
    }
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

    const outputDir = radioOutputDir(municipio, nome);
    await mkdir(outputDir, { recursive: true });

    const outputFile = path.join(outputDir, formatRecordingFilename());
    this.activeFiles.set(key, outputFile);
    this.activeFileSizes.set(key, 0);

    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-user_agent",
      "Mozilla/5.0 (compatible; radio55-recorder/1.0)",
      "-reconnect",
      "1",
      "-reconnect_at_eof",
      "1",
      "-reconnect_streamed",
      "1",
      "-reconnect_delay_max",
      "30",
    ];

    if (info.streamUrl.startsWith("https://")) {
      args.push("-tls_verify", "0");
    }

    args.push(...FFMPEG_LIVE_INPUT_FLAGS, "-i", info.streamUrl);
    args.push(
      "-c:a",
      "libmp3lame",
      "-b:a",
      "96k",
      "-ar",
      "44100",
      "-ac",
      "2",
      "-write_xing",
      "0",
      "-id3v2_version",
      "3",
      "-flush_packets",
      "1",
      "-f",
      "mp3",
      "-y",
      outputFile,
    );

    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    this.errors.delete(key);

    proc.stderr?.on("data", (chunk: Buffer) => {
      const message = chunk.toString().trim();
      if (!message || isBenignFfmpegMessage(message)) return;
      this.errors.set(key, message.slice(-200));
    });

    proc.on("exit", async (code, signal) => {
      this.processes.delete(key);

      const finishedFile = this.activeFiles.get(key);
      this.activeFiles.delete(key);
      this.activeFileSizes.delete(key);

      if (finishedFile) {
        await finalizarGravacao(finishedFile);
      }

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
    const activePaths = this.getActivePaths();
    let removed = 0;

    const walk = async (dir: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          await walk(fullPath);
          continue;
        }

        if (!entry.name.endsWith(".mp3")) continue;
        if (activePaths.has(fullPath)) continue;

        const fileStat = await stat(fullPath);
        if (fileStat.mtimeMs < cutoff) {
          await unlink(fullPath);
          await marcarGravacaoRemovida(fullPath);
          removed += 1;
        }
      }
    };

    await walk(RECORDINGS_DIR);
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
        const outputDir = radioOutputDir(municipio, radio.nome);
        const files = await this.listMp3Files(outputDir);
        const arquivoAtual = this.activeFiles.get(key) ?? null;
        const tamanhoAtualBytes = this.activeFileSizes.get(key) ?? null;

        statuses.push({
          key,
          municipio,
          nome: radio.nome,
          ativo: this.processes.has(key),
          streamUrl: info?.streamUrl ?? null,
          diretorio: outputDir,
          arquivos: files.length,
          ultimoArquivo: arquivoAtual ? path.basename(arquivoAtual) : (files.at(-1) ?? null),
          arquivoAtual: arquivoAtual ? path.basename(arquivoAtual) : null,
          tamanhoAtualBytes,
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

export function getActiveRecordingPaths(): Set<string> {
  return getService().getActivePaths();
}
