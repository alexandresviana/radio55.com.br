import { isDatabaseConfigured } from "@/lib/db";
import { listarPalavrasChaveAtivas } from "@/lib/palavras-chave-db";
import { encontrarPalavrasNoTexto } from "@/lib/text-normalize";
import { fetchChannelVideosFromRss } from "@/lib/youtube-channel";
import { registrarDeteccaoYoutube } from "@/lib/youtube-deteccoes-db";
import {
  atualizarStatusVideoYoutube,
  listarYoutubeCanaisAtivos,
  marcarCanalVerificado,
  obterProximoVideoPendente,
  registrarVideoYoutube,
} from "@/lib/youtube-db";
import {
  fetchYoutubeTranscript,
  YoutubeAguardandoEstreiaError,
  YoutubeSemTranscriptError,
  type YoutubeTranscriptSegment,
} from "@/lib/youtube-transcript-fetch";
import { salvarSegmentosYoutube } from "@/lib/youtube-transcricoes-db";

const SYNC_MS = 5 * 60 * 1000;
const PROCESS_MS = 20_000;

type MonitorGlobal = typeof globalThis & {
  __radio55YoutubeMonitor?: YoutubeMonitorService;
};

class YoutubeMonitorService {
  private started = false;
  private syncTimer?: NodeJS.Timeout;
  private processTimer?: NodeJS.Timeout;
  private syncing = false;
  private processing = false;
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

    this.syncTimer = setInterval(() => {
      void this.syncCanais();
    }, SYNC_MS);

    this.processTimer = setInterval(() => {
      void this.processarFila();
    }, PROCESS_MS);
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
      const { segmentos, fonte } = await fetchYoutubeTranscript(video.video_id);
      await salvarSegmentosYoutube(video.id, segmentos);
      await this.detectarPalavras(video.id, segmentos);
      await atualizarStatusVideoYoutube(video.id, "concluido", `fonte: ${fonte}`);
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

  private async detectarPalavras(
    videoDbId: number,
    segmentos: YoutubeTranscriptSegment[],
  ): Promise<void> {
    const palavras = await listarPalavrasChaveAtivas();
    if (palavras.length === 0) return;

    const termos = palavras.map((item) => item.termo);

    for (const segmento of segmentos) {
      const matches = encontrarPalavrasNoTexto(segmento.texto, termos);
      for (const match of matches) {
        const palavra = palavras.find(
          (item) => item.termo.toLowerCase() === match.termo.toLowerCase(),
        );

        await registrarDeteccaoYoutube({
          palavraChaveId: palavra?.id ?? null,
          videoDbId,
          termo: match.termo,
          inicioSegundos: segmento.inicioSegundos,
          fimSegundos: segmento.fimSegundos,
          contexto: segmento.texto.trim(),
        });
      }
    }
  }
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
