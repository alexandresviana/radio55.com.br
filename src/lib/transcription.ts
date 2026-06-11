import { spawn } from "node:child_process";
import { access, mkdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { getTrechosDir, getWhisperCacheDir } from "@/lib/data-dir";
import {
  atualizarTrechoDeteccao,
  obterProgressoTranscricao,
  registrarDeteccao,
  salvarProgressoTranscricao,
} from "@/lib/deteccoes-db";
import { isDatabaseConfigured } from "@/lib/db";
import { extractMp3Clip, extractWavSegment } from "@/lib/ffmpeg-audio";
import { obterGravacaoPorCaminho } from "@/lib/gravacoes-db";
import { listarPalavrasChaveAtivas } from "@/lib/palavras-chave-db";
import { salvarSegmentosTranscricao } from "@/lib/transcricoes-db";
import { getActiveRecordingPaths } from "@/lib/recorder";
import { encontrarPalavrasNoTexto, normalizeText } from "@/lib/text-normalize";

const POLL_MS = 15_000;
const CHUNK_SECONDS = 30;
const OVERLAP_SECONDS = 2;
const MIN_NEW_SECONDS = 18;
const BYTES_PER_SECOND = 12_000;

interface WhisperSegment {
  start: number;
  end: number;
  text: string;
}

type TranscriptionGlobal = typeof globalThis & {
  __radio55Transcription?: TranscriptionService;
};

class TranscriptionService {
  private timer?: NodeJS.Timeout;
  private started = false;
  private busy = false;
  private whisperReady: boolean | null = null;
  private lastError: string | null = null;

  async start(): Promise<void> {
    if (this.started || !isDatabaseConfigured()) return;
    if (process.env.WHISPER_ENABLED === "false") {
      console.warn("[transcription] WHISPER_ENABLED=false — transcrição desativada");
      return;
    }

    this.started = true;
    await mkdir(getWhisperCacheDir(), { recursive: true });
    await mkdir(getTrechosDir(), { recursive: true });

    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, POLL_MS);
  }

  getStatus() {
    return {
      ativo: this.started,
      ocupado: this.busy,
      whisperDisponivel: this.whisperReady,
      erro: this.lastError,
    };
  }

  private async tick(): Promise<void> {
    if (this.busy || !isDatabaseConfigured()) return;

    const keywords = await listarPalavrasChaveAtivas();
    const activePaths = [...getActiveRecordingPaths()];
    if (activePaths.length === 0) return;

    this.busy = true;
    try {
      for (const filePath of activePaths) {
        await this.processFile(filePath, keywords);
      }
    } finally {
      this.busy = false;
    }
  }

  private async processFile(
    filePath: string,
    keywords: { id: number; termo: string }[],
  ): Promise<void> {
    let fileStat;
    try {
      fileStat = await stat(filePath);
    } catch {
      return;
    }

    const progress = await obterProgressoTranscricao(filePath);
    const startSecond = Math.max(0, (progress?.ultimo_segundo ?? 0) - OVERLAP_SECONDS);
    const availableSeconds = fileStat.size / BYTES_PER_SECOND;

    if (availableSeconds - startSecond < MIN_NEW_SECONDS) return;

    const duration = Math.min(CHUNK_SECONDS, availableSeconds - startSecond);
    const gravacao = await obterGravacaoPorCaminho(filePath);
    if (!gravacao) return;

    const tempDir = path.join(getWhisperCacheDir(), "chunks");
    await mkdir(tempDir, { recursive: true });
    const wavPath = path.join(tempDir, `${gravacao.id}-${Date.now()}.wav`);

    try {
      await extractWavSegment(filePath, startSecond, duration, wavPath);
      const segments = await this.transcribeWav(wavPath);
      await salvarSegmentosTranscricao(
        gravacao.id,
        segments.map((segment) => ({
          inicioSegundos: startSecond + segment.start,
          fimSegundos: startSecond + segment.end,
          texto: segment.text,
        })),
      );

      if (keywords.length > 0) {
        await this.detectInSegments({
          segments,
          chunkStart: startSecond,
          gravacaoId: gravacao.id,
          filePath,
          keywords,
        });
      }

      const nextSecond = Math.max(startSecond + duration - OVERLAP_SECONDS, 0);
      await salvarProgressoTranscricao({
        caminho: filePath,
        gravacaoId: gravacao.id,
        ultimoSegundo: nextSecond,
      });
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : "Erro na transcrição";
      console.error("[transcription]", this.lastError);
    } finally {
      await unlink(wavPath).catch(() => {});
    }
  }

  private async transcribeWav(wavPath: string): Promise<WhisperSegment[]> {
    const pythonPath = process.env.WHISPER_PYTHON ?? "/opt/whisper/bin/python";
    const scriptPath =
      process.env.WHISPER_SCRIPT ?? path.join(process.cwd(), "scripts", "transcribe.py");

    try {
      await access(pythonPath);
      await access(scriptPath);
      this.whisperReady = true;
    } catch {
      this.whisperReady = false;
      throw new Error("Whisper não disponível neste ambiente");
    }

    const modelCacheDir =
      process.env.WHISPER_CACHE_DIR?.trim() || getWhisperCacheDir();

    const stdout = await new Promise<string>((resolve, reject) => {
      const proc = spawn(pythonPath, [scriptPath, wavPath], {
        env: {
          ...process.env,
          HF_HOME: modelCacheDir,
          WHISPER_CACHE_DIR: modelCacheDir,
          WHISPER_MODEL: process.env.WHISPER_MODEL ?? "base",
          HF_HUB_OFFLINE: process.env.HF_HUB_OFFLINE ?? "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });

      let out = "";
      let err = "";

      proc.stdout.on("data", (chunk: Buffer) => {
        out += chunk.toString();
      });
      proc.stderr.on("data", (chunk: Buffer) => {
        err += chunk.toString();
      });

      proc.on("error", reject);
      proc.on("exit", (code) => {
        if (code === 0) resolve(out);
        else reject(new Error(err.trim().slice(-300) || `Whisper saiu com código ${code}`));
      });
    });

    const parsed = JSON.parse(stdout) as { segments?: WhisperSegment[] };
    return parsed.segments ?? [];
  }

  private async detectInSegments(input: {
    segments: WhisperSegment[];
    chunkStart: number;
    gravacaoId: number;
    filePath: string;
    keywords: { id: number; termo: string }[];
  }): Promise<void> {
    const termos = input.keywords.map((item) => item.termo);
    const termoPorNormalizado = new Map(
      input.keywords.map((item) => [normalizeText(item.termo), item]),
    );

    for (const segment of input.segments) {
      const texto = segment.text.trim();
      if (!texto) continue;

      const absStart = input.chunkStart + segment.start;
      const absEnd = input.chunkStart + segment.end;
      const matches = encontrarPalavrasNoTexto(texto, termos);

      for (const match of matches) {
        const keyword = termoPorNormalizado.get(normalizeText(match.termo));
        if (!keyword) continue;

        const deteccao = await registrarDeteccao({
          palavraChaveId: keyword.id,
          gravacaoId: input.gravacaoId,
          termo: keyword.termo,
          inicioSegundos: absStart,
          fimSegundos: absEnd,
          contexto: texto,
        });

        if (!deteccao) continue;

        const trechoPath = path.join(getTrechosDir(), `${deteccao.id}.mp3`);
        try {
          await extractMp3Clip(input.filePath, absStart, trechoPath);
          await atualizarTrechoDeteccao(deteccao.id, trechoPath);
        } catch (error) {
          console.error("[transcription] Falha ao gerar trecho:", error);
        }
      }
    }
  }
}

function getService(): TranscriptionService {
  const globalRef = globalThis as TranscriptionGlobal;
  if (!globalRef.__radio55Transcription) {
    globalRef.__radio55Transcription = new TranscriptionService();
  }
  return globalRef.__radio55Transcription;
}

export async function startTranscriptionService(): Promise<void> {
  await getService().start();
}

export function getTranscriptionStatus() {
  return getService().getStatus();
}
