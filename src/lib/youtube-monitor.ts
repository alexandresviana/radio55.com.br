import { isDatabaseConfigured } from "@/lib/db";
import { fetchChannelVideosFromRss } from "@/lib/youtube-channel";
import {
  detectarPalavrasEmSegmentosYoutube,
  escanearDeteccoesVideoYoutube,
} from "@/lib/youtube-deteccao";
import { listarVideosConcluidosParaReescanear } from "@/lib/youtube-deteccoes-db";
import {
  atualizarStatusVideoYoutube,
  listarYoutubeCanaisAtivos,
  marcarCanalVerificado,
  obterProximoVideoPendente,
  registrarVideoYoutube,
  salvarDuracaoVideoYoutube,
} from "@/lib/youtube-db";
import { fetchYoutubeVideoDuration } from "@/lib/youtube-transcript-innertube";
import { duracaoTranscriptSegundos } from "@/lib/youtube-transcript-utils";
import {
  fetchYoutubeTranscript,
  YoutubeAguardandoEstreiaError,
  YoutubeSemTranscriptError,
} from "@/lib/youtube-transcript-fetch";
import { salvarSegmentosYoutube } from "@/lib/youtube-transcricoes-db";

const SYNC_MS = 5 * 60 * 1000;
const PROCESS_MS = 20_000;
const RESCAN_MS = 45_000;
const RESCAN_LOTE = 4;

type MonitorGlobal = typeof globalThis & {
  __radio55YoutubeMonitor?: YoutubeMonitorService;
};

class YoutubeMonitorService {
  private started = false;
  private syncTimer?: NodeJS.Timeout;
  private processTimer?: NodeJS.Timeout;
  private rescanTimer?: NodeJS.Timeout;
  private syncing = false;
  private processing = false;
  private rescanning = false;
  private rescanOffset = 0;
  private lastError: string | null = null;
  private lastSyncAt: string | null = null;
  private lastProcessAt: string | null = null;
  private videosProcessados = 0;

  async start(): Promise<void> {
    if (this.started || !isDatabaseConfigured()) return;
    if (process.env.YOUTUBE_ENABLED === "false") {
      console.warn("[youtube] YOUTUBE_ENABLED=false — monitor desativado");
      return;
    }

    this.started = true;
    void this.syncCanais();
    void this.processarFila();
    void this.reescanearDeteccoes();

    this.syncTimer = setInterval(() => {
      void this.syncCanais();
    }, SYNC_MS);

    this.processTimer = setInterval(() => {
      void this.processarFila();
    }, PROCESS_MS);

    this.rescanTimer = setInterval(() => {
      void this.reescanearDeteccoes();
    }, RESCAN_MS);
  }

  getStatus() {
    return {
      ativo: this.started,
      sincronizando: this.syncing,
      processando: this.processing,
      erro: this.lastError,
      ultima_sincronizacao: this.lastSyncAt,
      ultimo_processamento: this.lastProcessAt,
      videos_processados: this.videosProcessados,
    };
  }

  async forceSync(): Promise<void> {
    await this.syncCanais();
  }

  private async syncCanais(): Promise<void> {
    if (this.syncing || !isDatabaseConfigured()) return;

    this.syncing = true;
    try {
      const canais = await listarYoutubeCanaisAtivos();
      for (const canal of canais) {
        const videos = await fetchChannelVideosFromRss(canal.channel_id);
        for (const video of videos) {
          await registrarVideoYoutube({
            canalId: canal.id,
            videoId: video.videoId,
            titulo: video.titulo,
            publicadoEm: video.publicadoEm,
          });
        }
        await marcarCanalVerificado(canal.id);
      }
      this.lastSyncAt = new Date().toISOString();
      this.lastError = null;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : "Erro ao sincronizar canais";
      console.error("[youtube]", this.lastError);
    } finally {
      this.syncing = false;
    }
  }

  private async processarFila(): Promise<void> {
    if (this.processing || !isDatabaseConfigured()) return;

    const video = await obterProximoVideoPendente();
    if (!video) return;

    this.processing = true;
    await atualizarStatusVideoYoutube(video.id, "processando");

    try {
      const duracaoVideo = await fetchYoutubeVideoDuration(video.video_id);
      if (duracaoVideo) {
        await salvarDuracaoVideoYoutube(video.id, duracaoVideo);
      }

      const { segmentos, fonte } = await fetchYoutubeTranscript(video.video_id);
      const duracaoTranscript = duracaoTranscriptSegundos(segmentos);

      if (
        duracaoVideo &&
        duracaoVideo > 120 &&
        duracaoTranscript < duracaoVideo * 0.7
      ) {
        throw new YoutubeSemTranscriptError(
          `Transcrição incompleta (${Math.round(duracaoTranscript)}s de ${duracaoVideo}s)`,
        );
      }

      await salvarSegmentosYoutube(video.id, segmentos);
      await detectarPalavrasEmSegmentosYoutube(
        video.id,
        segmentos.map((item) => ({
          inicioSegundos: item.inicioSegundos,
          fimSegundos: item.fimSegundos,
          texto: item.texto,
        })),
      );
      await atualizarStatusVideoYoutube(
        video.id,
        "concluido",
        `fonte: ${fonte} · ${Math.round(duracaoTranscript)}s`,
      );
      this.videosProcessados += 1;
      this.lastProcessAt = new Date().toISOString();
      this.lastError = null;
    } catch (error) {
      if (error instanceof YoutubeAguardandoEstreiaError) {
        await atualizarStatusVideoYoutube(video.id, "aguardando", error.message);
      } else if (error instanceof YoutubeSemTranscriptError) {
        await atualizarStatusVideoYoutube(video.id, "sem_transcript", error.message);
      } else {
        const message = error instanceof Error ? error.message : "Erro ao processar vídeo";
        await atualizarStatusVideoYoutube(video.id, "erro", message);
        this.lastError = message;
        console.error("[youtube]", message);
      }
    } finally {
      this.processing = false;
    }
  }

  private async reescanearDeteccoes(): Promise<void> {
    if (this.rescanning || !isDatabaseConfigured()) return;

    this.rescanning = true;
    try {
      const videoIds = await listarVideosConcluidosParaReescanear(
        RESCAN_LOTE,
        this.rescanOffset,
      );

      if (videoIds.length === 0) {
        this.rescanOffset = 0;
        return;
      }

      for (const videoDbId of videoIds) {
        await escanearDeteccoesVideoYoutube(videoDbId);
      }

      this.rescanOffset += videoIds.length;
    } catch (error) {
      console.error(
        "[youtube] reescaneamento de detecções:",
        error instanceof Error ? error.message : error,
      );
    } finally {
      this.rescanning = false;
    }
  }
}

export async function reescanearDeteccoesYoutubeAgora(limite = 20): Promise<number> {
  const videoIds = await listarVideosConcluidosParaReescanear(limite, 0);
  let total = 0;

  for (const videoDbId of videoIds) {
    total += await escanearDeteccoesVideoYoutube(videoDbId);
  }

  return total;
}

export function getYoutubeMonitorStatus() {
  const globalRef = globalThis as MonitorGlobal;
  return globalRef.__radio55YoutubeMonitor?.getStatus() ?? {
    ativo: false,
    sincronizando: false,
    processando: false,
    erro: null,
    ultima_sincronizacao: null,
    ultimo_processamento: null,
    videos_processados: 0,
  };
}

export async function startYoutubeMonitorService(): Promise<void> {
  const globalRef = globalThis as MonitorGlobal;
  if (!globalRef.__radio55YoutubeMonitor) {
    globalRef.__radio55YoutubeMonitor = new YoutubeMonitorService();
  }
  await globalRef.__radio55YoutubeMonitor.start();
}

export async function syncYoutubeCanaisAgora(): Promise<void> {
  const globalRef = globalThis as MonitorGlobal;
  if (!globalRef.__radio55YoutubeMonitor) {
    globalRef.__radio55YoutubeMonitor = new YoutubeMonitorService();
    await globalRef.__radio55YoutubeMonitor.start();
  }
  await globalRef.__radio55YoutubeMonitor.forceSync();
}
