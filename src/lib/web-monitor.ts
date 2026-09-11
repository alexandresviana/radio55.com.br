import { isDatabaseConfigured } from "@/lib/db";
import { listarPalavrasChaveAtivas } from "@/lib/palavras-chave-db";
import { garantirColetaAtualizada } from "@/lib/coleta-coletor";
import { isColetaCompartilhada } from "@/lib/coleta-db";
import { consumirWebCompartilhado, publicarFontesWeb } from "@/lib/coleta-consumidor";
import { deveForcarColetaApify, fonteVencida } from "@/lib/apify-guard";
import { getProviderWeb, isSocialCrawlConfigured } from "@/lib/socialcrawl-fetch";
import { escanearDeteccoesPublicacaoWeb } from "@/lib/web-deteccao";
import { getPool } from "@/lib/db";
import {
  listarWebSitesAtivos,
  marcarWebSiteVerificado,
  registrarPublicacaoWeb,
} from "@/lib/web-db";
import { coletarFeedRss } from "@/lib/web-rss-fetch";

// Google News tem 1 crédito por termo por chamada. Mantém intervalo folgado.
const SYNC_MINUTOS_PADRAO = 360;
const RESCAN_MS = 60_000;
const RESCAN_LOTE = 15;

function getSyncMs(): number {
  const raw = Number(process.env.WEB_SYNC_MINUTOS ?? SYNC_MINUTOS_PADRAO);
  const minutos = Number.isFinite(raw) && raw >= 5 ? raw : SYNC_MINUTOS_PADRAO;
  return minutos * 60 * 1000;
}

function getConsumoMs(): number {
  const raw = Number(process.env.COLETA_CONSUMO_MINUTOS ?? 15);
  const minutos = Number.isFinite(raw) && raw >= 1 ? raw : 15;
  return minutos * 60 * 1000;
}

function webPodeRodar(): boolean {
  if (isColetaCompartilhada()) return true;
  if (getProviderWeb() === "socialcrawl" && isSocialCrawlConfigured()) return true;
  return isDatabaseConfigured();
}

async function listarPublicacoesParaReescanear(
  limite: number,
  offset: number,
): Promise<Array<{ id: number }>> {
  if (!isDatabaseConfigured()) return [];
  const result = await getPool().query<{ id: number }>(
    `SELECT id
     FROM web_publicacoes
     WHERE titulo <> '' OR snippet <> ''
     ORDER BY COALESCE(publicado_em, criado_em) DESC
     LIMIT $1 OFFSET $2`,
    [Math.min(Math.max(limite, 1), 100), Math.max(offset, 0)],
  );
  return result.rows;
}

async function coletarSitesRssLocal(): Promise<number> {
  const sites = await listarWebSitesAtivos();
  if (sites.length === 0) return 0;

  const palavras = await listarPalavrasChaveAtivas();
  const limiteRaw = Number(process.env.WEB_RSS_POR_SITE ?? 25);
  const limite = Number.isFinite(limiteRaw) && limiteRaw >= 1 ? Math.min(limiteRaw, 80) : 25;
  let novos = 0;

  for (const site of sites) {
    if (!site.feed_url) {
      await marcarWebSiteVerificado(site.id, "feed ausente");
      continue;
    }
    try {
      const artigos = await coletarFeedRss(site.feed_url, {
        dominio: site.dominio,
        fonte: site.titulo || site.dominio,
        limite,
      });
      for (const artigo of artigos) {
        const salvo = await registrarPublicacaoWeb({
          palavraChaveId: null,
          siteId: site.id,
          url: artigo.url,
          titulo: artigo.titulo,
          fonte: artigo.fonte,
          dominio: site.dominio,
          snippet: artigo.snippet,
          publicadoEm: artigo.publicadoEm,
          imagemUrl: artigo.imagemUrl,
          searchTerm: "",
        });
        if (!salvo) continue;
        if (salvo.novo) novos += 1;
        if (salvo.novo || salvo.textoMudou) {
          await escanearDeteccoesPublicacaoWeb(salvo.id, palavras);
        }
      }
      await marcarWebSiteVerificado(site.id, null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "falha RSS";
      console.error("[web] RSS", site.dominio, message);
      await marcarWebSiteVerificado(site.id, message);
    }
  }

  return novos;
}

type MonitorGlobal = typeof globalThis & {
  __radio55WebMonitor?: WebMonitorService;
  __radio55WebSyncTimer?: NodeJS.Timeout;
};

class WebMonitorService {
  private started = false;
  private syncTimer?: NodeJS.Timeout;
  private rescanTimer?: NodeJS.Timeout;
  private syncing = false;
  private rescanning = false;
  private rescanOffset = 0;
  private lastError: string | null = null;
  private lastSyncAt: string | null = null;
  private publicacoesColetadas = 0;
  private ultimaTentativaEm: string | null = null;

  async start(): Promise<void> {
    if (this.started || !isDatabaseConfigured()) return;
    if (process.env.WEB_ENABLED === "false") {
      console.warn("[web] WEB_ENABLED=false — monitor desativado");
      return;
    }
    if (!webPodeRodar()) {
      console.warn("[web] monitor de sites desativado");
      return;
    }

    this.started = true;
    void this.reescanearDeteccoes();
    void this.syncTermos({ forcar: deveForcarColetaApify() });

    this.syncTimer = setInterval(() => {
      void this.syncTermos();
    }, isColetaCompartilhada() ? getConsumoMs() : getSyncMs());

    this.rescanTimer = setInterval(() => {
      void this.reescanearDeteccoes();
    }, RESCAN_MS);
  }

  getStatus() {
    return {
      ativo: this.started,
      coleta_configurada: webPodeRodar(),
      coleta_compartilhada: isColetaCompartilhada(),
      sincronizando: this.syncing,
      erro: this.lastError,
      ultima_sincronizacao: this.lastSyncAt,
      ultima_tentativa: this.ultimaTentativaEm,
      publicacoes_coletadas: this.publicacoesColetadas,
      intervalo_minutos: Math.round(
        (isColetaCompartilhada() ? getConsumoMs() : getSyncMs()) / 60000,
      ),
    };
  }

  async forceSync(): Promise<void> {
    await this.syncTermos({ forcar: true });
  }

  async forceRescan(limite = 40): Promise<void> {
    const pubs = await listarPublicacoesParaReescanear(limite, 0);
    const palavras = await listarPalavrasChaveAtivas();
    for (const pub of pubs) {
      await escanearDeteccoesPublicacaoWeb(pub.id, palavras);
    }
  }

  async syncTermos(opts?: { forcar?: boolean }): Promise<void> {
    if (this.syncing || !isDatabaseConfigured() || !webPodeRodar()) return;

    this.ultimaTentativaEm = new Date().toISOString();

    if (isColetaCompartilhada()) {
      this.syncing = true;
      try {
        await publicarFontesWeb();
        if (opts?.forcar) await garantirColetaAtualizada({ forcar: true });
        this.publicacoesColetadas += await consumirWebCompartilhado();
        this.lastSyncAt = new Date().toISOString();
        this.lastError = null;
      } catch (error) {
        this.lastError =
          error instanceof Error ? error.message : "Erro ao consumir coleta web";
        console.error("[web]", this.lastError);
      } finally {
        this.syncing = false;
      }
      return;
    }

    this.syncing = true;
    try {
      const intervaloMs = getSyncMs();
      const desatualizado = fonteVencida(this.lastSyncAt, intervaloMs);
      if (opts?.forcar || desatualizado) {
        this.publicacoesColetadas += await coletarSitesRssLocal();
        if (getProviderWeb() === "socialcrawl" && isSocialCrawlConfigured()) {
          await garantirColetaAtualizada({ forcar: true });
        }
      }
      this.lastSyncAt = new Date().toISOString();
      this.lastError = null;
    } catch (error) {
      this.lastError =
        error instanceof Error ? error.message : "Erro ao sincronizar web";
      console.error("[web]", this.lastError);
    } finally {
      this.syncing = false;
    }
  }

  private async reescanearDeteccoes(): Promise<void> {
    if (this.rescanning || !isDatabaseConfigured()) return;
    this.rescanning = true;
    try {
      const pubs = await listarPublicacoesParaReescanear(RESCAN_LOTE, this.rescanOffset);
      if (pubs.length === 0) {
        this.rescanOffset = 0;
        return;
      }
      const palavras = await listarPalavrasChaveAtivas();
      for (const pub of pubs) {
        await escanearDeteccoesPublicacaoWeb(pub.id, palavras);
      }
      this.rescanOffset =
        pubs.length < RESCAN_LOTE ? 0 : this.rescanOffset + RESCAN_LOTE;
    } catch (error) {
      console.error(
        "[web] rescan:",
        error instanceof Error ? error.message : error,
      );
    } finally {
      this.rescanning = false;
    }
  }
}

function getService(): WebMonitorService {
  const globalRef = globalThis as MonitorGlobal;
  if (!globalRef.__radio55WebMonitor) {
    globalRef.__radio55WebMonitor = new WebMonitorService();
  }
  return globalRef.__radio55WebMonitor;
}

export async function startWebMonitorService(): Promise<void> {
  await getService().start();
}

export async function syncWebAgora(): Promise<void> {
  await getService().forceSync();
}

export async function reescanearDeteccoesWebAgora(limite = 40): Promise<void> {
  await getService().forceRescan(limite);
}

export function getWebMonitorStatus() {
  return getService().getStatus();
}

const AGENDAR_SYNC_DEBOUNCE_MS = 60_000;
const AGENDAR_SYNC_COOLDOWN_MS = 10 * 60_000;

export function agendarSyncWeb(): void {
  const globalRef = globalThis as MonitorGlobal;
  const status = getWebMonitorStatus();
  if (status.sincronizando) return;
  if (status.ultima_sincronizacao) {
    const idade = Date.now() - new Date(status.ultima_sincronizacao).getTime();
    if (Number.isFinite(idade) && idade < AGENDAR_SYNC_COOLDOWN_MS) return;
  }
  if (globalRef.__radio55WebSyncTimer) clearTimeout(globalRef.__radio55WebSyncTimer);
  globalRef.__radio55WebSyncTimer = setTimeout(() => {
    globalRef.__radio55WebSyncTimer = undefined;
    void getService().forceSync();
  }, AGENDAR_SYNC_DEBOUNCE_MS);
}
