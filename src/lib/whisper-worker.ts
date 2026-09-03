import { spawn, type ChildProcess } from "node:child_process";
import { createInterface, type Interface as ReadlineInterface } from "node:readline";
import { access } from "node:fs/promises";
import path from "node:path";
import { getWhisperCacheDir } from "@/lib/data-dir";
import { killOrphanWhisperWorkers } from "@/lib/whisper-lock";

const READY_TIMEOUT_MS = 90_000;
const JOB_TIMEOUT_MS = 120_000;

export interface WhisperSegment {
  start: number;
  end: number;
  text: string;
}

interface WorkerResponse {
  event?: string;
  ok?: boolean;
  id?: number;
  language?: string;
  segments?: WhisperSegment[];
  error?: string;
}

type PendingJob = {
  id: number;
  resolve: (segments: WhisperSegment[]) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

function whisperEnv(): NodeJS.ProcessEnv {
  const cpuThreads = process.env.WHISPER_CPU_THREADS?.trim() || "1";
  const modelCacheDir = process.env.WHISPER_CACHE_DIR?.trim() || getWhisperCacheDir();

  return {
    ...process.env,
    HF_HOME: modelCacheDir,
    WHISPER_CACHE_DIR: modelCacheDir,
    WHISPER_MODEL: process.env.WHISPER_MODEL ?? "base",
    HF_HUB_OFFLINE: process.env.HF_HUB_OFFLINE ?? "1",
    WHISPER_CPU_THREADS: cpuThreads,
    OMP_NUM_THREADS: cpuThreads,
    OPENBLAS_NUM_THREADS: cpuThreads,
    MKL_NUM_THREADS: cpuThreads,
    VECLIB_MAXIMUM_THREADS: cpuThreads,
    NUMEXPR_NUM_THREADS: cpuThreads,
    CT2_INTER_THREADS: cpuThreads,
  };
}

export class WhisperWorker {
  private proc: ChildProcess | null = null;
  private rl: ReadlineInterface | null = null;
  private ready = false;
  private starting: Promise<void> | null = null;
  private nextId = 1;
  private pending: PendingJob | null = null;
  private generation = 0;

  async transcribe(wavPath: string): Promise<WhisperSegment[]> {
    await this.ensure();
    const proc = this.proc;
    const stdin = proc?.stdin;
    if (!proc || !stdin || proc.killed) {
      throw new Error("Worker Whisper indisponível");
    }

    const id = this.nextId++;
    return new Promise<WhisperSegment[]>((resolve, reject) => {
      if (this.pending) {
        reject(new Error("Worker Whisper ocupado"));
        return;
      }

      const timer = setTimeout(() => {
        if (this.pending?.id === id) {
          this.pending = null;
          this.generation += 1;
          this.kill();
          reject(new Error("Whisper excedeu o tempo do chunk"));
        }
      }, JOB_TIMEOUT_MS);

      this.pending = { id, resolve, reject, timer };

      const ok = stdin.write(`${JSON.stringify({ id, path: wavPath })}\n`);
      if (!ok) {
        stdin.once("drain", () => {});
      }
    });
  }

  stop(): void {
    this.generation += 1;
    this.kill();
  }

  private async ensure(): Promise<void> {
    if (this.proc && this.ready && !this.proc.killed) return;
    if (this.starting) {
      await this.starting;
      return;
    }
    this.starting = this.spawn();
    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }

  private async spawn(): Promise<void> {
    const pythonPath = process.env.WHISPER_PYTHON ?? "/opt/whisper/bin/python";
    const scriptPath =
      process.env.WHISPER_SCRIPT ?? path.join(process.cwd(), "scripts", "transcribe.py");

    await access(pythonPath);
    await access(scriptPath);

    const generation = ++this.generation;
    this.kill();

    const orphans = killOrphanWhisperWorkers();
    if (orphans > 0) {
      console.warn(`[transcription] encerrou ${orphans} worker(s) Whisper órfão(s)`);
    }

    await new Promise<void>((resolve, reject) => {
      // Spawn direto: `nice` como pai deixava o Python órfão no timeout/restart.
      const proc = spawn(pythonPath, [scriptPath, "--worker"], {
        env: whisperEnv(),
        stdio: ["pipe", "pipe", "pipe"],
      });

      this.proc = proc;
      this.ready = false;

      const rl = createInterface({ input: proc.stdout! });
      this.rl = rl;

      const readyTimer = setTimeout(() => {
        if (generation !== this.generation) return;
        this.kill();
        reject(new Error("Whisper não ficou pronto a tempo"));
      }, READY_TIMEOUT_MS);

      rl.on("line", (line) => {
        if (generation !== this.generation) return;
        let msg: WorkerResponse;
        try {
          msg = JSON.parse(line) as WorkerResponse;
        } catch {
          return;
        }

        if (!this.ready && msg.event === "ready") {
          this.ready = true;
          clearTimeout(readyTimer);
          console.info("[transcription] worker Whisper pronto (modelo persistente)");
          resolve();
          return;
        }

        this.handleResponse(msg);
      });

      proc.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString().trim();
        if (text) console.info("[whisper]", text.slice(-400));
      });

      proc.on("error", (error) => {
        if (generation !== this.generation) return;
        clearTimeout(readyTimer);
        if (!this.ready) reject(error);
        else this.failPending(error);
      });

      proc.on("exit", (code, signal) => {
        if (generation !== this.generation) return;
        clearTimeout(readyTimer);
        const stillStarting = !this.ready;
        this.ready = false;
        if (this.proc === proc) {
          this.proc = null;
          this.rl?.close();
          this.rl = null;
        }

        const error = new Error(
          `Worker Whisper saiu (código ${code ?? "?"}${signal ? `/${signal}` : ""})`,
        );
        this.failPending(error);
        if (stillStarting) reject(error);
        else console.warn("[transcription]", error.message);
      });
    });
  }

  private handleResponse(msg: WorkerResponse): void {
    const job = this.pending;
    if (!job || msg.id !== job.id) return;

    clearTimeout(job.timer);
    this.pending = null;

    if (msg.ok === false) {
      job.reject(new Error(msg.error || "Falha no Whisper"));
      return;
    }

    job.resolve(msg.segments ?? []);
  }

  private failPending(error: Error): void {
    const job = this.pending;
    if (!job) return;
    clearTimeout(job.timer);
    this.pending = null;
    job.reject(error);
  }

  private kill(): void {
    const proc = this.proc;
    this.proc = null;
    this.ready = false;
    this.rl?.close();
    this.rl = null;

    if (!proc || proc.killed) return;

    proc.kill("SIGTERM");
    setTimeout(() => {
      if (proc.exitCode == null && !proc.killed) proc.kill("SIGKILL");
    }, 3_000).unref();
  }
}
