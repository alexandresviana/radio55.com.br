/**
 * Coleta de anúncios da Biblioteca de Anúncios (Meta) via Apify.
 * O nome do provedor nunca aparece na dashboard — aqui é só infra.
 *
 * Actor: apify/facebook-ads-scraper
 */

const APIFY_BASE = "https://api.apify.com/v2";
const ACTOR_ADS_ID = "apify~facebook-ads-scraper";
const FETCH_TIMEOUT_MS = 5 * 60 * 1000;
const PAIS_PADRAO = "BR";

export interface AnuncioMetaColetado {
  adArchiveId: string;
  url: string;
  pageId: string;
  pageName: string;
  pageProfileUri: string;
  texto: string;
  titulo: string;
  ctaText: string;
  linkUrl: string | null;
  imagemUrl: string | null;
  videoUrl: string | null;
  inicioEm: Date | null;
  fimEm: Date | null;
  /** URL enviada ao coletor (busca por termo ou página). */
  inputUrl: string;
  /** Termo de busca, quando a origem foi keyword. */
  searchTerm: string | null;
}

interface ApifyCard {
  body?: string;
  title?: string;
  ctaText?: string;
  linkUrl?: string;
  originalImageUrl?: string | null;
  resizedImageUrl?: string | null;
  videoPreviewImageUrl?: string | null;
  videoHdUrl?: string | null;
  videoSdUrl?: string | null;
}

interface ApifyAdItem {
  inputUrl?: string;
  adArchiveID?: string;
  adArchiveId?: string;
  pageID?: string;
  pageId?: string;
  startDateFormatted?: string;
  endDateFormatted?: string;
  snapshot?: {
    pageId?: string;
    pageName?: string;
    pageProfileUri?: string;
    caption?: string;
    ctaText?: string;
    body?: { text?: string } | string;
    title?: string;
    linkUrl?: string;
    cards?: ApifyCard[];
    images?: Array<{ originalImageUrl?: string; resizedImageUrl?: string }>;
    videos?: Array<{
      videoHdUrl?: string;
      videoSdUrl?: string;
      videoPreviewImageUrl?: string;
    }>;
  };
  error?: string;
}

export function getMetaAdsFetchToken(): string {
  return process.env.APIFY_TOKEN?.trim() ?? "";
}

export function isMetaAdsFetchConfigured(): boolean {
  return Boolean(getMetaAdsFetchToken());
}

export function getMetaAdsPais(): string {
  const raw = (process.env.META_ADS_PAIS ?? PAIS_PADRAO).trim().toUpperCase();
  return /^[A-Z]{2}$/.test(raw) ? raw : PAIS_PADRAO;
}

/** Termo de busca na biblioteca (palavra ou frase). */
export function extrairTermoMetaAds(entrada: string): string | null {
  const candidato = entrada.trim().replace(/\s+/g, " ");
  if (!candidato || candidato.length > 120) return null;
  if (!/^[\p{L}\p{N}_.#-]+(?: [\p{L}\p{N}_.#-]+)*$/u.test(candidato)) return null;
  return candidato.toLowerCase();
}

/** Aceita URL facebook.com/..., @pagina ou slug. */
export function extrairPaginaFacebook(entrada: string): string | null {
  const valor = entrada.trim();
  if (!valor) return null;

  let candidato = valor.replace(/^@/, "");

  if (/facebook\.com|fb\.com/i.test(valor)) {
    try {
      const url = new URL(valor.startsWith("http") ? valor : `https://${valor}`);
      const partes = url.pathname.split("/").filter(Boolean);
      if (partes.length === 0) return null;
      const primeiro = partes[0].toLowerCase();
      if (["ads", "watch", "groups", "events", "marketplace", "reel", "share"].includes(primeiro)) {
        // Ad Library page id
        const pageId = url.searchParams.get("view_all_page_id");
        if (pageId && /^\d+$/.test(pageId)) return pageId;
        return null;
      }
      if (primeiro === "profile.php") {
        const id = url.searchParams.get("id");
        return id && /^\d+$/.test(id) ? id : null;
      }
      candidato = partes[0];
    } catch {
      return null;
    }
  }

  candidato = candidato.replace(/\/+$/, "");
  if (/^\d{5,}$/.test(candidato)) return candidato;
  if (!/^[A-Za-z0-9.]{2,80}$/.test(candidato)) return null;
  return candidato;
}

export function urlPaginaFacebook(slugOuId: string): string {
  if (/^\d+$/.test(slugOuId)) {
    return `https://www.facebook.com/profile.php?id=${slugOuId}`;
  }
  return `https://www.facebook.com/${encodeURIComponent(slugOuId)}`;
}

export function urlBuscaBibliotecaAds(termo: string, pais = getMetaAdsPais()): string {
  const params = new URLSearchParams({
    active_status: "active",
    ad_type: "all",
    country: pais,
    media_type: "all",
    q: termo,
    search_type: "keyword_unordered",
  });
  return `https://www.facebook.com/ads/library/?${params.toString()}`;
}

export function urlAnuncioBiblioteca(adArchiveId: string, pageId?: string): string {
  const params = new URLSearchParams({
    id: adArchiveId,
    country: getMetaAdsPais(),
  });
  if (pageId) params.set("view_all_page_id", pageId);
  return `https://www.facebook.com/ads/library/?${params.toString()}`;
}

export async function coletarAnunciosMeta(
  startUrls: string[],
  opts: { limiteTotal?: number } = {},
): Promise<AnuncioMetaColetado[]> {
  const token = getMetaAdsFetchToken();
  if (!token) {
    throw new Error("Coleta de anúncios Meta não configurada no servidor");
  }

  const unicos = [...new Set(startUrls.map((u) => u.trim()).filter(Boolean))];
  if (unicos.length === 0) return [];

  const limite = Math.min(Math.max(opts.limiteTotal ?? 15, 1), 200);

  const url = `${APIFY_BASE}/acts/${ACTOR_ADS_ID}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&format=json`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      startUrls: unicos.map((u) => ({ url: u })),
      resultsLimit: limite,
      activeStatus: "active",
      isDetailsPerAd: false,
      includeAboutPage: false,
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    const detalhe = await res.text().catch(() => "");
    console.error("[meta-ads] coleta:", res.status, detalhe.slice(0, 300));
    throw new Error(`Coleta de anúncios Meta falhou (HTTP ${res.status})`);
  }

  const items = (await res.json()) as ApifyAdItem[];
  if (!Array.isArray(items)) return [];

  const anuncios = normalizarAnuncios(items);
  console.warn(
    `[meta-ads] coleta: ${anuncios.length} anúncio(s) útil(is) de ${items.length} item(ns)`,
  );
  return anuncios;
}

function normalizarAnuncios(items: ApifyAdItem[]): AnuncioMetaColetado[] {
  const anuncios: AnuncioMetaColetado[] = [];

  for (const item of items) {
    if (item.error) continue;
    const adArchiveId = String(item.adArchiveId ?? item.adArchiveID ?? "").trim();
    if (!adArchiveId) continue;

    const snap = item.snapshot ?? {};
    const cards = snap.cards ?? [];
    const pageId = String(snap.pageId ?? item.pageId ?? item.pageID ?? "").trim();
    const pageName = (snap.pageName ?? "").trim();

    const textos: string[] = [];
    const bodySnap =
      typeof snap.body === "string" ? snap.body : (snap.body?.text ?? "");
    if (bodySnap.trim()) textos.push(bodySnap.trim());
    if (snap.title?.trim()) textos.push(snap.title.trim());
    if (snap.caption?.trim()) textos.push(snap.caption.trim());

    for (const card of cards) {
      if (card.body?.trim()) textos.push(card.body.trim());
      if (card.title?.trim()) textos.push(card.title.trim());
    }

    const texto = [...new Set(textos)].join("\n").trim();
    const titulo =
      cards[0]?.title?.trim() || snap.title?.trim() || pageName || "Anúncio";
    const ctaText = cards[0]?.ctaText?.trim() || snap.ctaText?.trim() || "";
    const linkUrl =
      cards[0]?.linkUrl?.trim() ||
      snap.linkUrl?.trim() ||
      null;

    const imagemUrl =
      cards[0]?.originalImageUrl ||
      cards[0]?.resizedImageUrl ||
      cards[0]?.videoPreviewImageUrl ||
      snap.images?.[0]?.originalImageUrl ||
      snap.images?.[0]?.resizedImageUrl ||
      snap.videos?.[0]?.videoPreviewImageUrl ||
      null;

    const videoUrl =
      cards[0]?.videoHdUrl ||
      cards[0]?.videoSdUrl ||
      snap.videos?.[0]?.videoHdUrl ||
      snap.videos?.[0]?.videoSdUrl ||
      null;

    const inputUrl = (item.inputUrl ?? "").trim();
    const searchTerm = extrairTermoDeUrlBiblioteca(inputUrl);

    anuncios.push({
      adArchiveId,
      url: urlAnuncioBiblioteca(adArchiveId, pageId || undefined),
      pageId,
      pageName,
      pageProfileUri: snap.pageProfileUri ?? (pageId ? urlPaginaFacebook(pageId) : ""),
      texto,
      titulo,
      ctaText,
      linkUrl,
      imagemUrl,
      videoUrl,
      inicioEm: item.startDateFormatted ? new Date(item.startDateFormatted) : null,
      fimEm: item.endDateFormatted ? new Date(item.endDateFormatted) : null,
      inputUrl,
      searchTerm,
    });
  }

  return anuncios;
}

function extrairTermoDeUrlBiblioteca(inputUrl: string): string | null {
  if (!inputUrl || !/ads\/library/i.test(inputUrl)) return null;
  try {
    const url = new URL(inputUrl);
    const q = url.searchParams.get("q")?.trim();
    return q ? q.toLowerCase() : null;
  } catch {
    return null;
  }
}
