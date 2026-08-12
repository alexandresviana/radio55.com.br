import { mkdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { getTrechosDir, getWhisperCacheDir } from "@/lib/data-dir";
import {
  atualizarTrechoDeteccao,
  obterProgressoTranscricao,
  registrarDeteccao,
  salvarProgressoTranscricao,
} from "@/lib/deteccoes-db";
import { isDatabaseConfigured, isPgUniqueViolation } from "@/lib/db";
import { extractMp3Clip, extractWavSegment } from "@/lib/ffmpeg-audio";
import { obterGravacaoPorCaminho } from "@/lib/gravacoes-db";
import { listarPalavrasChaveAtivas } from "@/lib/palavras-chave-db";
import { salvarSegmentosTranscricao } from "@/lib/transcricoes-db";
import { getActiveRecordingPaths, getRecordingBytesPerSecond } from "@/lib/recorder";
import { encontrarPalavrasNoTexto, normalizeText } from "@/lib/text-normalize";
import { WhisperWorker, type WhisperSegment } from "@/lib/whisper-worker";

const POLL_MS = 15_000;
const CHUNK_SECONDS = 30;
const OVERLAP_SECONDS = 2;
const MIN_NEW_SECONDS = 18;
const LIVE_EDGE_MARGIN_SEC = 12;
const BYTES_PER_SECOND_PADRAO = 12_000;

type TranscriptionGlobal = typeof globalThis & {
  __radio55Transcription?: TranscriptionService;
};

class TranscriptionService {
  private timer?: NodeJS.Timeout;
  private started = false;
  private busy = false;
  private whisperReady: boolean | null = null;
  private lastError: string | null = null;
  private worker = new WhisperWorker();

  async start(): Promise<void> {
    if (this.started || !isDatabaseConfigured()) return;
    if (process.env.WHISPER_ENABLED === "false") {
      console.warn("[transcription] WHISPER_ENABLED=false — transcrição desativada");
      return;
    }

    this.started = true;
    await mkdir(getWhisperCacheDir(), { recursive: true });
    await mkdir(getTrechosDir(), { recursive: true });

    const globalRef = globalThis as TranscriptionGlobal & {
      __radio55TranscriptionShutdownHook?: boolean;
    };
    if (!globalRef.__radio55TranscriptionShutdownHook) {
      globalRef.__radio55TranscriptionShutdownHook = true;
      const stop = () => this.worker.stop();
      process.once("SIGTERM", stop);
      process.once("SIGINT", stop);
    }

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

    const activePaths = [...getActiveRecordingPaths()];
    if (activePaths.length === 0) return;

    this.busy = true;
    try {
      const keywords = await listarPalavrasChaveAtivas();
      for (const filePath of activePaths) {
        await this.processFile(filePath, keywords);
      }
      this.lastError = null;
    } catch (error) {
      // Sem catch isso virava unhandledRejection e sujava o log a cada poll.
      this.lastError = error instanceof Error ? error.message : "Erro na transcrição";
      console.error("[transcription]", this.lastError);
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
    const bytesPerSecond = getRecordingBytesPerSecond(filePath) || BYTES_PER_SECOND_PADRAO;
    const availableSeconds = Math.max(
      0,
      fileStat.size / bytesPerSecond - LIVE_EDGE_MARGIN_SEC,
    );

    if (availableSeconds - startSecond < MIN_NEW_SECONDS) return;

    const duration = Math.min(CHUNK_SECONDS, availableSeconds - startSecond);
    if (duration < 10) return;
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
      if (isPgUniqueViolation(error)) {
        const nextSecond = Math.max(startSecond + duration - OVERLAP_SECONDS, 0);
        await salvarProgressoTranscricao({
          caminho: filePath,
          gravacaoId: gravacao.id,
          ultimoSegundo: nextSecond,
        }).catch(() => {});
        return;
      }
      this.lastError = error instanceof Error ? error.message : "Erro na transcrição";
      console.error("[transcription]", this.lastError);
    } finally {
      await unlink(wavPath).catch(() => {});
    }
  }

  private async transcribeWav(wavPath: string): Promise<WhisperSegment[]> {
    try {
      const segments = await this.worker.transcribe(wavPath);
      this.whisperReady = true;
      return segments;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Whisper indisponível";
      if (/não disponível|não ficou pronto|ENOENT/i.test(message)) {
        this.whisperReady = false;
      }
      throw error;
    }
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
