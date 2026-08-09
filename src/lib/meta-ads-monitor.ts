import { isDatabaseConfigured } from "@/lib/db";
import {
  escanearDeteccoesMetaAd,
  registrarDeteccaoDeBuscaMetaAds,
} from "@/lib/meta-ads-deteccao";
import {
  listarMetaAdsBuscasAtivas,
  listarMetaAdsPaginasAtivas,
  listarMetaAdsParaReescanear,
  marcarMetaAdsBuscaVerificada,
  marcarMetaAdsPaginaVerificada,
  registrarMetaAd,
} from "@/lib/meta-ads-db";
import {
  coletarAnunciosMeta,
  isMetaAdsFetchConfigured,
  urlBuscaBibliotecaAds,
  urlPaginaFacebook,
} from "@/lib/meta-ads-fetch";
import { listarPalavrasChaveAtivas } from "@/lib/palavras-chave-db";

const SYNC_MINUTOS_PADRAO = 30;
const RESCAN_MS = 60_000;
const RESCAN_LOTE = 15;

function getSyncMs(): number {
  const raw = Number(process.env.META_ADS_SYNC_MINUTOS ?? SYNC_MINUTOS_PADRAO);
  const minutos = Number.isFinite(raw) && raw >= 5 ? raw : SYNC_MINUTOS_PADRAO;
  return minutos * 60 * 1000;
}

function getAdsPorCiclo(): number {
  const raw = Number(process.env.META_ADS_POR_CICLO ?? 40);
  return Number.isFinite(raw) && raw >= 5 ? Math.min(Math.floor(raw), 200) : 40;
}

type MonitorGlobal = typeof globalThis & {
  __radio55MetaAdsMonitor?: MetaAdsMonitorService;
};

class MetaAdsMonitorService {
  private started = false;
  private syncTimer?: NodeJS.Timeout;
  private rescanTimer?: NodeJS.Timeout;
  private syncing = false;
  private rescanning = false;
  private rescanOffset = 0;
  private lastError: string | null = null;
  private lastSyncAt: string | null = null;
  private anunciosColetados = 0;

  async start(): Promise<void> {
    if (this.started || !isDatabaseConfigured()) return;
    if (process.env.META_ADS_ENABLED === "false") {
      console.warn("[meta-ads] META_ADS_ENABLED=false — monitor desativado");
      return;
    }
    if (!isMetaAdsFetchConfigured()) {
      console.warn("[meta-ads] token de coleta ausente — monitor desativado");
      return;
    }

    this.started = true;
    void this.reescanearDeteccoes();
    void this.syncFontes();

    this.syncTimer = setInterval(() => {
      void this.syncFontes();
    }, getSyncMs());

    this.rescanTimer = setInterval(() => {
      void this.reescanearDeteccoes();
    }, RESCAN_MS);
  }

  getStatus() {
    return {
      ativo: this.started,
      coleta_configurada: isMetaAdsFetchConfigured(),
      sincronizando: this.syncing,
      erro: this.lastError,
      ultima_sincronizacao: this.lastSyncAt,
      anuncios_coletados: this.anunciosColetados,
      intervalo_minutos: Math.round(getSyncMs() / 60000),
    };
  }

  async forceSync(): Promise<void> {
    await this.syncFontes();
  }

  async forceRescan(limite = 40): Promise<void> {
    const ads = await listarMetaAdsParaReescanear(limite, 0);
    const palavras = await listarPalavrasChaveAtivas();
    for (const ad of ads) {
      await escanearDeteccoesMetaAd(ad.id, palavras);
    }
  }

  private async syncFontes(): Promise<void> {
    if (this.syncing || !isDatabaseConfigured() || !isMetaAdsFetchConfigured()) return;

    this.syncing = true;
    try {
      const [buscas, paginas] = await Promise.all([
        listarMetaAdsBuscasAtivas(),
        listarMetaAdsPaginasAtivas(),
      ]);

      if (buscas.length === 0 && paginas.length === 0) return;

      const urls: string[] = [
        ...buscas.map((b) => urlBuscaBibliotecaAds(b.termo)),
        ...paginas.map((p) => p.url_entrada || urlPaginaFacebook(p.slug)),
      ];

      const anuncios = await coletarAnunciosMeta(urls, { limiteTotal: getAdsPorCiclo() });

      const buscasAtuais = await listarMetaAdsBuscasAtivas();
      const paginasAtuais = await listarMetaAdsPaginasAtivas();
      const buscaPorTermo = new Map(buscasAtuais.map((b) => [b.termo.toLowerCase(), b]));
      const paginaPorId = new Map(
        paginasAtuais.filter((p) => /^\d+$/.test(p.slug)).map((p) => [p.slug, p]),
      );
      const palavras = await listarPalavrasChaveAtivas();

      for (const anuncio of anuncios) {
        let busca = anuncio.searchTerm
          ? buscaPorTermo.get(anuncio.searchTerm.toLowerCase())
          : undefined;

        let pagina =
          (anuncio.pageId && paginaPorId.get(anuncio.pageId)) || undefined;

        if (!pagina) {
          for (const p of paginasAtuais) {
            const slug = p.slug.toLowerCase();
            if (
              anuncio.inputUrl.toLowerCase().includes(slug) ||
              anuncio.pageProfileUri.toLowerCase().includes(slug) ||
              anuncio.pageName.toLowerCase() === slug
            ) {
              pagina = p;
              break;
            }
          }
        }

        if (!busca) {
          const termoNoTexto = [...buscaPorTermo.keys()].find((t) =>
            `${anuncio.texto} ${anuncio.titulo}`.toLowerCase().includes(t),
          );
          if (termoNoTexto) busca = buscaPorTermo.get(termoNoTexto);
        }

        if (!busca && !pagina) continue;

        const salvo = await registrarMetaAd({
          buscaId: busca?.id ?? null,
          paginaId: pagina?.id ?? null,
          adArchiveId: anuncio.adArchiveId,
          pageId: anuncio.pageId,
          pageName: anuncio.pageName,
          url: anuncio.url,
          texto: anuncio.texto,
          titulo: anuncio.titulo,
          ctaText: anuncio.ctaText,
          linkUrl: anuncio.linkUrl,
          imagemUrl: anuncio.imagemUrl,
          videoUrl: anuncio.videoUrl,
          inicioEm: anuncio.inicioEm,
          fimEm: anuncio.fimEm,
        });

        if (!salvo) continue;
        if (salvo.novo) this.anunciosColetados += 1;
        if (salvo.novo || salvo.textoMudou) {
          await escanearDeteccoesMetaAd(salvo.id, palavras);
          if (busca) {
            await registrarDeteccaoDeBuscaMetaAds(salvo.id, busca.termo);
          }
        }
      }

      for (const busca of buscasAtuais) {
        await marcarMetaAdsBuscaVerificada(busca.id, null);
      }
      for (const pagina of paginasAtuais) {
        await marcarMetaAdsPaginaVerificada(pagina.id, null);
      }

      this.lastSyncAt = new Date().toISOString();
      this.lastError = null;
    } catch (error) {
      this.lastError =
        error instanceof Error ? error.message : "Erro ao sincronizar anúncios Meta";
      console.error("[meta-ads]", this.lastError);

      try {
        const [buscas, paginas] = await Promise.all([
          listarMetaAdsBuscasAtivas(),
          listarMetaAdsPaginasAtivas(),
        ]);
        for (const busca of buscas) {
          await marcarMetaAdsBuscaVerificada(busca.id, this.lastError);
        }
        for (const pagina of paginas) {
          await marcarMetaAdsPaginaVerificada(pagina.id, this.lastError);
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
      const ads = await listarMetaAdsParaReescanear(RESCAN_LOTE, this.rescanOffset);
      if (ads.length === 0) {
        this.rescanOffset = 0;
        return;
      }

      const palavras = await listarPalavrasChaveAtivas();
      for (const ad of ads) {
        await escanearDeteccoesMetaAd(ad.id, palavras);
      }

      this.rescanOffset =
        ads.length < RESCAN_LOTE ? 0 : this.rescanOffset + RESCAN_LOTE;
    } catch (error) {
      console.error(
        "[meta-ads] rescan:",
        error instanceof Error ? error.message : error,
      );
    } finally {
      this.rescanning = false;
    }
  }
}

function getService(): MetaAdsMonitorService {
  const globalRef = globalThis as MonitorGlobal;
  if (!globalRef.__radio55MetaAdsMonitor) {
    globalRef.__radio55MetaAdsMonitor = new MetaAdsMonitorService();
  }
  return globalRef.__radio55MetaAdsMonitor;
}

export async function startMetaAdsMonitorService(): Promise<void> {
  await getService().start();
}

export async function syncMetaAdsAgora(): Promise<void> {
  await getService().forceSync();
}

export async function reescanearDeteccoesMetaAdsAgora(limite = 40): Promise<void> {
  await getService().forceRescan(limite);
}

export function getMetaAdsMonitorStatus() {
  return getService().getStatus();
}
