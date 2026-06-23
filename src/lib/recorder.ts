import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { getGravacoesDir } from "@/lib/data-dir";
import { readEmissoras } from "@/lib/emissoras";
import { finalizarGravacao, marcarGravacaoRemovida } from "@/lib/gravacoes-db";
import { tentarUploadGravacaoPorCaminho } from "@/lib/bunny-storage-uploader";
import { isBenignFfmpegMessage } from "@/lib/ffmpeg-audio";
import { formatRecordingFilename, radioOutputDir } from "@/lib/gravacoes-path";
import { getRadioStream, makeStreamKey, readRadioStreams } from "@/lib/radios-streams";
import { buildFfmpegStreamInputArgs, probeStreamUrl } from "@/lib/stream-input";

const RECORDINGS_DIR = getGravacoesDir();
const RETENTION_MS = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const SYNC_INTERVAL_MS = 5 * 60 * 1000;
const RESTART_DELAY_MS = 15_000;
const ROTATE_MS = Number(process.env.RECORDING_ROTATE_MS ?? 60 * 60 * 1000);
const GRACEFUL_STOP_TIMEOUT_MS = 12_000;

type StopReason = "rotate" | "shutdown" | "disabled" | "restart";

interface ActiveRecording {
  proc: ChildProcess;
  municipio: string;
  nome: string;
  filePath: string;
  intentionalStop: boolean;
  stopReason?: StopReason;
  rotateTimer: NodeJS.Timeout;
}

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
  __radio55RecorderShutdownHook?: boolean;
};

function waitForExit(proc: ChildProcess, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (proc.exitCode != null || proc.killed) {
      resolve(true);
      return;
    }

    const timer = setTimeout(() => resolve(false), timeoutMs);

    proc.once("exit", () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

async function stopFfmpegGracefully(proc: ChildProcess): Promise<void> {
  if (proc.exitCode != null || proc.killed) return;

  if (proc.stdin && !proc.stdin.destroyed) {
    proc.stdin.write("q");
    const exited = await waitForExit(proc, GRACEFUL_STOP_TIMEOUT_MS);
    if (exited) return;
  }

  proc.kill("SIGINT");
  const exited = await waitForExit(proc, 5_000);
  if (exited) return;

  proc.kill("SIGKILL");
  await waitForExit(proc, 2_000);
}

class RecorderService {
  private recordings = new Map<string, ActiveRecording>();
  private activeFileSizes = new Map<string, number>();
  private errors = new Map<string, string>();
  private cleanupTimer?: NodeJS.Timeout;
  private syncTimer?: NodeJS.Timeout;
  private sizeTimer?: NodeJS.Timeout;
  private started = false;
  private shuttingDown = false;

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    this.registerShutdownHook();

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

  private registerShutdownHook(): void {
    const globalRef = globalThis as RecorderGlobal;
    if (globalRef.__radio55RecorderShutdownHook) return;
    globalRef.__radio55RecorderShutdownHook = true;

    const handler = () => {
      void this.shutdownAll();
    };

    process.once("SIGTERM", handler);
    process.once("SIGINT", handler);
  }

  getActivePaths(): Set<string> {
    return new Set([...this.recordings.values()].map((item) => item.filePath));
  }

  private async refreshActiveFileSizes(): Promise<void> {
    for (const [key, recording] of this.recordings.entries()) {
      try {
        const fileStat = await stat(recording.filePath);
        this.activeFileSizes.set(key, fileStat.size);
      } catch {
        this.activeFileSizes.delete(key);
      }
    }
  }

  async sync(): Promise<void> {
    if (this.shuttingDown) return;

    const emissoras = await readEmissoras();
    const desired = new Set<string>();

    for (const [municipio, data] of Object.entries(emissoras)) {
      for (const radio of data.radios) {
        if (!radio.gravar) continue;

        const key = makeStreamKey(municipio, radio.nome);
        desired.add(key);

        if (!this.recordings.has(key)) {
          await this.startOne(municipio, radio.nome);
        }
      }
    }

    for (const key of this.recordings.keys()) {
      if (!desired.has(key)) {
        await this.stopOne(key, "disabled");
        this.errors.delete(key);
      }
    }
  }

  async forceRestart(opts?: { municipio?: string; nome?: string }): Promise<number> {
    let restarted = 0;

    for (const [key, recording] of this.recordings.entries()) {
      if (opts?.municipio && recording.municipio !== opts.municipio) continue;
      if (opts?.nome && recording.nome !== opts.nome) continue;

      await this.stopOne(key, "restart");
      restarted += 1;
    }

    if (!this.shuttingDown) {
      await this.sync();
    }

    return restarted;
  }

  async shutdownAll(): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;

    const stops = [...this.recordings.keys()].map((key) => this.stopOne(key, "shutdown"));
    await Promise.all(stops);
  }

  private async startOne(municipio: string, nome: string): Promise<void> {
    if (this.shuttingDown) return;

    const key = makeStreamKey(municipio, nome);
    if (this.recordings.has(key)) return;

    const info = await getRadioStream(municipio, nome);

    if (!info?.streamUrl) {
      this.errors.set(key, "Stream não disponível no radios.com.br");
      return;
    }

    const outputDir = radioOutputDir(municipio, nome);
    await mkdir(outputDir, { recursive: true });

    const outputFile = path.join(outputDir, formatRecordingFilename());
    this.activeFileSizes.set(key, 0);

    const probe = await probeStreamUrl(info.streamUrl);
    if (!probe.ok) {
      this.errors.set(
        key,
        `Stream Icecast/Shoutcast inacessível — ${probe.error ?? "sem áudio"}`,
      );
      setTimeout(() => {
        if (!this.shuttingDown) {
          void this.startOne(municipio, nome);
        }
      }, RESTART_DELAY_MS);
      return;
    }

    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      ...buildFfmpegStreamInputArgs(info.streamUrl),
      "-map",
      "0:a:0?",
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
    ];

    const proc = spawn("ffmpeg", args, { stdio: ["pipe", "ignore", "pipe"] });
    this.errors.delete(key);

    const rotateTimer = setTimeout(() => {
      void this.stopOne(key, "rotate");
    }, ROTATE_MS);

    const recording: ActiveRecording = {
      proc,
      municipio,
      nome,
      filePath: outputFile,
      intentionalStop: false,
      rotateTimer,
    };

    this.recordings.set(key, recording);

    proc.stderr?.on("data", (chunk: Buffer) => {
      const message = chunk.toString().trim();
      if (!message || isBenignFfmpegMessage(message)) return;

      const resumo = message.slice(-240);
      this.errors.set(key, resumo);

      if (/stream ends prematurely|connection reset|timed out|i\/o error/i.test(message)) {
        console.warn(`[recorder] ${key}: ${resumo}`);
      }
    });

    proc.on("exit", async (code, signal) => {
      clearTimeout(rotateTimer);

      const current = this.recordings.get(key);
      const finishedFile = current?.filePath;
      const intentional = current?.intentionalStop ?? false;
      const stopReason = current?.stopReason;
      const municipioAtual = current?.municipio ?? municipio;
      const nomeAtual = current?.nome ?? nome;

      this.recordings.delete(key);
      this.activeFileSizes.delete(key);

      if (finishedFile) {
        try {
          await finalizarGravacao(finishedFile);
          void tentarUploadGravacaoPorCaminho(finishedFile).catch((error) => {
            console.error(
              "[recorder] falha ao enviar para Bunny Storage:",
              error instanceof Error ? error.message : error,
            );
          });
        } catch (error) {
          console.error(
            `[recorder] falha ao finalizar ${finishedFile}:`,
            error instanceof Error ? error.message : error,
          );
        }
      }

      if (this.shuttingDown || stopReason === "shutdown" || stopReason === "disabled") {
        return;
      }

      if (stopReason === "rotate" || stopReason === "restart") {
        await this.startOne(municipioAtual, nomeAtual);
        return;
      }

      if (signal === "SIGTERM" || signal === "SIGKILL") {
        if (intentional) return;
      }

      const message =
        code === 0
          ? "Gravação encerrada — reiniciando"
          : `Stream caiu (código ${code ?? "?"}) — reiniciando em ${RESTART_DELAY_MS / 1000}s`;

      this.errors.set(key, message);

      setTimeout(() => {
        if (!this.shuttingDown) {
          void this.startOne(municipioAtual, nomeAtual);
        }
      }, RESTART_DELAY_MS);
    });
  }

  private async stopOne(key: string, reason: StopReason): Promise<void> {
    const recording = this.recordings.get(key);
    if (!recording) return;

    recording.intentionalStop = true;
    recording.stopReason = reason;
    clearTimeout(recording.rotateTimer);

    await stopFfmpegGracefully(recording.proc);
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
    let streams: Awaited<ReturnType<typeof readRadioStreams>> | null = null;

    try {
      streams = await readRadioStreams();
    } catch (error) {
      console.error("[recorder] Falha ao ler radios-streams.json:", error);
    }

    for (const [municipio, data] of Object.entries(emissoras)) {
      for (const radio of data.radios) {
        if (!radio.gravar) continue;

        const key = makeStreamKey(municipio, radio.nome);
        let info: Awaited<ReturnType<typeof getRadioStream>> = null;

        try {
          info = await getRadioStream(municipio, radio.nome);
        } catch (error) {
          console.error(`[recorder] Falha ao resolver stream ${key}:`, error);
        }

        const outputDir = radioOutputDir(municipio, radio.nome);
        const files = await this.listMp3Files(outputDir);
        const recording = this.recordings.get(key);
        const arquivoAtual = recording ? path.basename(recording.filePath) : null;
        const tamanhoAtualBytes = this.activeFileSizes.get(key) ?? null;

        statuses.push({
          key,
          municipio,
          nome: radio.nome,
          ativo: this.recordings.has(key),
          streamUrl: info?.streamUrl ?? streams?.[key]?.streamUrl ?? null,
          diretorio: outputDir,
          arquivos: files.length,
          ultimoArquivo: arquivoAtual ?? files.at(-1) ?? null,
          arquivoAtual,
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

export async function reiniciarGravacoes(opts?: {
  municipio?: string;
  nome?: string;
}): Promise<number> {
  return getService().forceRestart(opts);
}

export async function shutdownRecorderService(): Promise<void> {
  await getService().shutdownAll();
}

export async function getRecordingStatus(): Promise<RecordingStatus[]> {
  return getService().getStatus();
}

export function getActiveRecordingPaths(): Set<string> {
  return getService().getActivePaths();
}
