import { isDatabaseConfigured } from "@/lib/db";
import { listarPalavrasChaveAtivas } from "@/lib/palavras-chave-db";
import {
  listarXBuscasAtivas,
  listarXPostsParaReescanear,
  marcarXBuscaVerificada,
  registrarPostX,
} from "@/lib/x-db";
import { escanearDeteccoesPostX, registrarDeteccaoDeBuscaX } from "@/lib/x-deteccao";
import { coletarTweetsX, isXFetchConfigured } from "@/lib/x-fetch";

// Pacote econômico Apify: intervalo maior e menos itens por ciclo.
const SYNC_MINUTOS_PADRAO = 120;
const TWEETS_POR_CICLO_PADRAO = 15;
const RESCAN_MS = 60_000;
const RESCAN_LOTE = 15;
const AGENDAR_SYNC_DEBOUNCE_MS = 60_000;
const AGENDAR_SYNC_COOLDOWN_MS = 10 * 60_000;

function getSyncMs(): number {
  const raw = Number(process.env.X_SYNC_MINUTOS ?? SYNC_MINUTOS_PADRAO);
  const minutos = Number.isFinite(raw) && raw >= 5 ? raw : SYNC_MINUTOS_PADRAO;
  return minutos * 60 * 1000;
}

function getTweetsPorCiclo(): number {
  const raw = Number(process.env.X_TWEETS_POR_CICLO ?? TWEETS_POR_CICLO_PADRAO);
  return Number.isFinite(raw) && raw >= 5
    ? Math.min(Math.floor(raw), 200)
    : TWEETS_POR_CICLO_PADRAO;
}

type MonitorGlobal = typeof globalThis & {
  __radio55XMonitor?: XMonitorService;
  __radio55XSyncTimer?: NodeJS.Timeout;
};

class XMonitorService {
  private started = false;
  private syncTimer?: NodeJS.Timeout;
  private rescanTimer?: NodeJS.Timeout;
  private syncing = false;
  private rescanning = false;
  private rescanOffset = 0;
  private lastError: string | null = null;
  private lastSyncAt: string | null = null;
  private postsColetados = 0;

  async start(): Promise<void> {
    if (this.started || !isDatabaseConfigured()) return;
    if (process.env.X_ENABLED === "false") {
      console.warn("[x] X_ENABLED=false — monitor desativado");
      return;
    }
    if (!isXFetchConfigured()) {
      console.warn("[x] token de coleta ausente — monitor desativado");
      return;
    }

    this.started = true;
    void this.reescanearDeteccoes();
    void this.syncBuscas();

    this.syncTimer = setInterval(() => {
      void this.syncBuscas();
    }, getSyncMs());

    this.rescanTimer = setInterval(() => {
      void this.reescanearDeteccoes();
    }, RESCAN_MS);
  }

  getStatus() {
    return {
      ativo: this.started,
      coleta_configurada: isXFetchConfigured(),
      sincronizando: this.syncing,
      erro: this.lastError,
      ultima_sincronizacao: this.lastSyncAt,
      posts_coletados: this.postsColetados,
      intervalo_minutos: Math.round(getSyncMs() / 60000),
    };
  }

  async forceSync(): Promise<void> {
    await this.syncBuscas();
  }

  async forceRescan(limite = 40): Promise<void> {
    const posts = await listarXPostsParaReescanear(limite, 0);
    const palavras = await listarPalavrasChaveAtivas();
    for (const post of posts) {
      await escanearDeteccoesPostX(post.id, palavras);
    }
  }

  private async syncBuscas(): Promise<void> {
    if (this.syncing || !isDatabaseConfigured() || !isXFetchConfigured()) return;

    this.syncing = true;
    try {
      const buscas = await listarXBuscasAtivas();
      if (buscas.length === 0) return;

      const tweets = await coletarTweetsX(
        buscas.map((b) => b.termo),
        { limiteTotal: getTweetsPorCiclo() },
      );

      const buscasAtuais = await listarXBuscasAtivas();
      const buscaPorTermo = new Map(buscasAtuais.map((b) => [b.termo.toLowerCase(), b]));
      const palavras = await listarPalavrasChaveAtivas();

      for (const tweet of tweets) {
        const busca = tweet.searchTerm
          ? buscaPorTermo.get(tweet.searchTerm.toLowerCase())
          : undefined;
        if (!busca) continue;

        const salvo = await registrarPostX({
          buscaId: busca.id,
          autorUsername: tweet.autorUsername,
          autorNome: tweet.autorNome,
          tweetId: tweet.tweetId,
          url: tweet.url,
          texto: tweet.texto,
          publicadoEm: tweet.publicadoEm,
          imagemUrl: tweet.imagemUrl,
          curtidas: tweet.curtidas,
          retweets: tweet.retweets,
          respostas: tweet.respostas,
        });

        if (!salvo) continue;
        if (salvo.novo) this.postsColetados += 1;
        if (salvo.novo || salvo.textoMudou) {
          await escanearDeteccoesPostX(salvo.id, palavras);
          await registrarDeteccaoDeBuscaX(salvo.id, busca.termo);
        }
      }

      for (const busca of buscasAtuais) {
        await marcarXBuscaVerificada(busca.id, null);
      }

      this.lastSyncAt = new Date().toISOString();
      this.lastError = null;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : "Erro ao sincronizar buscas do X";
      console.error("[x]", this.lastError);

      try {
        const buscas = await listarXBuscasAtivas();
        for (const busca of buscas) {
          await marcarXBuscaVerificada(busca.id, this.lastError);
        }
      } catch {
        // ignore
      }
    } finally {
      this.syncing = false;
    }
  }

  private async reescanearDeteccoes(): Promise<void> {
    if (this.rescanning || !isDatabaseConfigured()) return;
    this.rescanning = true;

    try {
      const posts = await listarXPostsParaReescanear(RESCAN_LOTE, this.rescanOffset);
      if (posts.length === 0) {
        this.rescanOffset = 0;
        return;
      }

      const palavras = await listarPalavrasChaveAtivas();
      for (const post of posts) {
        await escanearDeteccoesPostX(post.id, palavras);
      }

      this.rescanOffset =
        posts.length < RESCAN_LOTE ? 0 : this.rescanOffset + RESCAN_LOTE;
    } catch (error) {
      console.error(
        "[x] rescan:",
        error instanceof Error ? error.message : error,
      );
    } finally {
      this.rescanning = false;
    }
  }
}

function getService(): XMonitorService {
  const globalRef = globalThis as MonitorGlobal;
  if (!globalRef.__radio55XMonitor) {
    globalRef.__radio55XMonitor = new XMonitorService();
  }
  return globalRef.__radio55XMonitor;
}

export async function startXMonitorService(): Promise<void> {
  await getService().start();
}

export async function syncXBuscasAgora(): Promise<void> {
  await getService().forceSync();
}

/** Sync com debounce/cooldown — use em CRUD para não disparar Apify a cada cadastro. */
export function agendarSyncXBuscas(): void {
  const globalRef = globalThis as MonitorGlobal;
  const status = getXMonitorStatus();
  if (status.sincronizando) return;
  if (status.ultima_sincronizacao) {
    const idade = Date.now() - new Date(status.ultima_sincronizacao).getTime();
    if (Number.isFinite(idade) && idade < AGENDAR_SYNC_COOLDOWN_MS) return;
  }
  if (globalRef.__radio55XSyncTimer) clearTimeout(globalRef.__radio55XSyncTimer);
  globalRef.__radio55XSyncTimer = setTimeout(() => {
    globalRef.__radio55XSyncTimer = undefined;
    void syncXBuscasAgora();
  }, AGENDAR_SYNC_DEBOUNCE_MS);
}

export async function reescanearDeteccoesXAgora(limite = 40): Promise<void> {
  await getService().forceRescan(limite);
}

export function getXMonitorStatus() {
  return getService().getStatus();
}
