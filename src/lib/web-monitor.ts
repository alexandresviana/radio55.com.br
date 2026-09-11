import { isDatabaseConfigured } from "@/lib/db";
import { listarPalavrasChaveAtivas } from "@/lib/palavras-chave-db";
import { garantirColetaAtualizada } from "@/lib/coleta-coletor";
import { isColetaCompartilhada } from "@/lib/coleta-db";
import { consumirWebCompartilhado, publicarFontesWeb } from "@/lib/coleta-consumidor";
import { deveForcarColetaApify, fonteVencida } from "@/lib/apify-guard";
import { getProviderWeb, isSocialCrawlConfigured } from "@/lib/socialcrawl-fetch";
import { escanearDeteccoesPublicacaoWeb } from "@/lib/web-deteccao";
import { getPool } from "@/lib/db";

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
  return getProviderWeb() === "socialcrawl" && isSocialCrawlConfigured();
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

type MonitorGlobal = typeof globalThis & {
  __radio55WebMonitor?: WebMonitorService;
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
      console.warn("[web] SocialCrawl não configurado — monitor de sites desativado");
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

    // Modo direto (coletor): usa o mesmo garantirColetaAtualizada que também
    // dispara a coleta web quando forcar=true; senão só faz consumo local.
    // Como não temos base compartilhada, precisamos rodar o coletor direto.
    this.syncing = true;
    try {
      // sem intervalo por termo aqui — o coletor cuida da lista completa.
      const intervaloMs = getSyncMs();
      const desatualizado = fonteVencida(this.lastSyncAt, intervaloMs);
      if (opts?.forcar || desatualizado) {
        await garantirColetaAtualizada({ forcar: true });
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
