/**
 * Coleta pública via SocialCrawl (socialcrawl.dev).
 * O nome do provedor nunca aparece na dashboard — aqui é só infra.
 *
 * Cobre Instagram (perfis + hashtags) e X (busca por termo).
 * Meta Ads segue no Apify.
 */

import {
  type PostInstagramColetado,
  urlHashtagInstagram,
  urlPerfilInstagram,
} from "@/lib/instagram-fetch";
import type { TweetColetado } from "@/lib/x-fetch";

const SC_BASE = "https://www.socialcrawl.dev/v1";
const FETCH_TIMEOUT_MS = 90_000;
const MAX_TENTATIVAS = 3;

interface CicloSocialCrawl {
  creditos: number;
  chamadas: number;
  cache: number;
  por: Record<string, { chamadas: number; creditos: number }>;
}

type SCGlobal = typeof globalThis & {
  __orbitSCCiclo?: CicloSocialCrawl;
  __orbitSCProcesso?: { creditos: number; chamadas: number };
};

function cicloVazio(): CicloSocialCrawl {
  return { creditos: 0, chamadas: 0, cache: 0, por: {} };
}

function grupoDoRotulo(rotulo: string): string {
  if (rotulo.startsWith("IG perfil")) return "ig_perfil";
  if (rotulo.startsWith("IG hashtag")) return "ig_hashtag";
  if (rotulo.startsWith("X ")) return "x";
  if (rotulo.startsWith("Google News")) return "google_news";
  return "outro";
}

export function iniciarCicloSocialCrawl(): void {
  (globalThis as SCGlobal).__orbitSCCiclo = cicloVazio();
}

export function resumoCicloSocialCrawl(): CicloSocialCrawl {
  return (globalThis as SCGlobal).__orbitSCCiclo ?? cicloVazio();
}

function registrarUsoSC(
  rotulo: string,
  path: string,
  env: SCEnvelope<unknown>,
  extra?: string,
): void {
  const creditos = Number(env.credits_used ?? 0) || 0;
  const restantes =
    env.credits_remaining == null ? "?" : String(env.credits_remaining);
  const cache = env.cached ? " cache" : "";
  const sufixo = extra ? ` ${extra}` : "";
  console.info(
    `[socialcrawl] ${rotulo} ${path} creditos=${creditos}${cache} restantes=${restantes}${sufixo}`,
  );

  const g = globalThis as SCGlobal;
  if (!g.__orbitSCCiclo) g.__orbitSCCiclo = cicloVazio();
  if (!g.__orbitSCProcesso) g.__orbitSCProcesso = { creditos: 0, chamadas: 0 };
  g.__orbitSCCiclo.chamadas += 1;
  g.__orbitSCCiclo.creditos += creditos;
  if (env.cached) g.__orbitSCCiclo.cache += 1;
  const grupo = grupoDoRotulo(rotulo);
  const atual = g.__orbitSCCiclo.por[grupo] ?? { chamadas: 0, creditos: 0 };
  atual.chamadas += 1;
  atual.creditos += creditos;
  g.__orbitSCCiclo.por[grupo] = atual;
  g.__orbitSCProcesso.chamadas += 1;
  g.__orbitSCProcesso.creditos += creditos;
}

type ProviderIG = "apify" | "socialcrawl";
type ProviderX = "apify" | "socialcrawl";
type ProviderWeb = "socialcrawl" | "off";

export function getSocialCrawlKey(): string {
  const raw = process.env["SOCIALCRAWL_API_KEY"];
  return typeof raw === "string" ? raw.trim() : "";
}

export function isSocialCrawlConfigured(): boolean {
  return Boolean(getSocialCrawlKey());
}

export function getProviderInstagram(): ProviderIG {
  return process.env.COLETA_PROVIDER_INSTAGRAM === "socialcrawl" ? "socialcrawl" : "apify";
}

export function getProviderX(): ProviderX {
  return process.env.COLETA_PROVIDER_X === "socialcrawl" ? "socialcrawl" : "apify";
}

/** Provedor de coleta web (Google News). Só liga quando SOCIALCRAWL_API_KEY existe. */
export function getProviderWeb(): ProviderWeb {
  if (process.env.COLETA_PROVIDER_WEB === "off") return "off";
  return isSocialCrawlConfigured() ? "socialcrawl" : "off";
}

interface SCEnvelope<T> {
  success?: boolean;
  data?: T;
  credits_used?: number;
  credits_remaining?: number;
  request_id?: string;
  cached?: boolean;
  error?: {
    type?: string;
    status?: number;
    message?: string;
    details?: { reason?: string };
  };
}

interface SCListData<T> {
  items?: T[];
  next_cursor?: string | null;
  total?: number | null;
  dropped?: number | null;
}

interface SCPost {
  post?: {
    id?: string;
    url?: string;
    content?: {
      text?: string | null;
      media_urls?: string | null;
      thumbnail_url?: string | null;
      duration_seconds?: number | null;
    };
    author?: {
      username?: string | null;
      display_name?: string | null;
    };
    engagement?: {
      views?: number | null;
      likes?: number | null;
      comments?: number | null;
      shares?: number | null;
    };
    flags?: {
      pinned?: boolean | null;
      deleted?: boolean | null;
    };
    published_at?: string | null;
  };
}

interface SCTweet {
  post?: {
    id?: string;
    url?: string;
    content?: {
      text?: string | null;
      thumbnail_url?: string | null;
    };
    author?: {
      username?: string | null;
      display_name?: string | null;
    };
    engagement?: {
      likes?: number | null;
      comments?: number | null;
      shares?: number | null;
    };
    published_at?: string | null;
    ext?: {
      all_media_urls?: string | null;
    };
  };
}

async function scGet<T>(
  path: string,
  params: Record<string, string>,
  rotulo: string,
): Promise<SCEnvelope<T>> {
  const key = getSocialCrawlKey();
  if (!key) throw new Error("SOCIALCRAWL_API_KEY não configurado");

  const query = new URLSearchParams(params).toString();
  const url = `${SC_BASE}${path}?${query}`;

  let tentativa = 0;
  while (true) {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "x-api-key": key },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (error) {
      if (tentativa >= MAX_TENTATIVAS - 1) {
        throw new Error(
          `SocialCrawl ${rotulo}: ${error instanceof Error ? error.message : "falha de rede"}`,
        );
      }
      tentativa += 1;
      await esperar(1500 * tentativa);
      continue;
    }

    if (res.status === 429 || res.status >= 500) {
      const falha = (await res.json().catch(() => ({}))) as SCEnvelope<T>;
      registrarUsoSC(rotulo, path, falha, `http=${res.status} tentativa=${tentativa + 1}`);
      if (tentativa >= MAX_TENTATIVAS - 1) {
        throw new Error(`SocialCrawl ${rotulo}: HTTP ${res.status}`);
      }
      tentativa += 1;
      console.warn(
        `[socialcrawl] ${rotulo}: retry ${tentativa}/${MAX_TENTATIVAS} após HTTP ${res.status}`,
      );
      await esperar(1500 * tentativa);
      continue;
    }

    const body = (await res.json().catch(() => ({}))) as SCEnvelope<T>;
    if (!body.success) {
      // 404 típico de perfil privado/inexistente: crédito é devolvido, retorna vazio.
      const err = body.error;
      if (err?.type === "RESOURCE_NOT_FOUND") {
        registrarUsoSC(
          rotulo,
          path,
          body,
          err.details?.reason ?? "não encontrado",
        );
        return body;
      }
      registrarUsoSC(rotulo, path, body, err?.type ?? "falha");
      throw new Error(
        `SocialCrawl ${rotulo}: ${err?.type ?? "falha"} ${err?.message ?? ""}`.trim(),
      );
    }
    registrarUsoSC(rotulo, path, body);
    return body;
  }
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extrairShortCodeInstagram(url: string): string {
  const match = /\/(?:p|reel|reels|tv)\/([^/?#]+)/i.exec(url);
  return match ? match[1] : "";
}

function inferirTipoInstagram(post: NonNullable<SCPost["post"]>): string {
  const dur = post.content?.duration_seconds;
  if (typeof dur === "number" && dur > 0) return "Video";
  const url = (post.url ?? "").toLowerCase();
  if (url.includes("/reel")) return "Video";
  return "Image";
}

function mapearPostInstagram(item: SCPost, inputUrl: string): PostInstagramColetado | null {
  const p = item.post;
  if (!p?.id) return null;
  if (p.flags?.deleted === true) return null;

  const url = p.url ?? "";
  const tipo = inferirTipoInstagram(p);
  const media = p.content?.media_urls ?? null;

  return {
    postId: String(p.id),
    shortCode: extrairShortCodeInstagram(url),
    url,
    tipo,
    legenda: (p.content?.text ?? "").trim(),
    publicadoEm: p.published_at ? new Date(p.published_at) : null,
    ownerUsername: (p.author?.username ?? "").toLowerCase(),
    videoUrl: tipo === "Video" ? media : null,
    imagemUrl: p.content?.thumbnail_url ?? null,
    curtidas: typeof p.engagement?.likes === "number" ? p.engagement.likes : null,
    comentarios:
      typeof p.engagement?.comments === "number" ? p.engagement.comments : null,
    inputUrl,
  };
}

function mapearTweet(item: SCTweet, searchTerm: string): TweetColetado | null {
  const p = item.post;
  if (!p?.id) return null;

  const midiaPrincipal =
    p.content?.thumbnail_url ??
    (p.ext?.all_media_urls ? p.ext.all_media_urls.split(",")[0]?.trim() || null : null);

  return {
    tweetId: String(p.id),
    url: p.url ?? `https://x.com/i/status/${p.id}`,
    texto: (p.content?.text ?? "").trim(),
    autorUsername: (p.author?.username ?? "").toLowerCase(),
    autorNome: p.author?.display_name ?? "",
    publicadoEm: p.published_at ? new Date(p.published_at) : null,
    curtidas: typeof p.engagement?.likes === "number" ? p.engagement.likes : null,
    retweets: typeof p.engagement?.shares === "number" ? p.engagement.shares : null,
    respostas:
      typeof p.engagement?.comments === "number" ? p.engagement.comments : null,
    imagemUrl: midiaPrincipal,
    searchTerm,
  };
}

/** "12 hours" / "7 days" → timestamp de corte. */
function parseRecenciaMs(spec: string | undefined): number | null {
  if (!spec) return null;
  const match = /^(\d+)\s*(hours?|days?)$/i.exec(spec.trim());
  if (!match) return null;
  const n = Number(match[1]);
  const factor = /day/i.test(match[2]) ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
  return Date.now() - n * factor;
}

function filtrarRecentes<T extends { publicadoEm: Date | null }>(
  posts: T[],
  corteMs: number | null,
): T[] {
  if (corteMs === null) return posts;
  return posts.filter((p) => !p.publicadoEm || p.publicadoEm.getTime() >= corteMs);
}

/**
 * Coleta posts do Instagram (perfis e hashtags) via SocialCrawl.
 * Ordenação da hashtag é mista (top + recentes) — filtramos por data local.
 */
export async function coletarPostsInstagramSC(
  fontes: { perfis?: string[]; termos?: string[] },
  opts: { limitePorFonte?: number; apenasMaisRecentesQue?: string } = {},
): Promise<PostInstagramColetado[]> {
  if (!isSocialCrawlConfigured()) {
    throw new Error("SocialCrawl não configurado no servidor");
  }

  const perfis = [...new Set((fontes.perfis ?? []).map((p) => p.trim().toLowerCase()).filter(Boolean))];
  const termos = [...new Set((fontes.termos ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean))];
  if (perfis.length === 0 && termos.length === 0) return [];

  const limite = Math.min(Math.max(opts.limitePorFonte ?? 5, 1), 50);
  const corteMs = parseRecenciaMs(opts.apenasMaisRecentesQue);

  const jobs: Promise<PostInstagramColetado[]>[] = [];

  for (const handle of perfis) {
    jobs.push(
      (async () => {
        try {
          const env = await scGet<SCListData<SCPost>>(
            "/instagram/profile/posts",
            { handle },
            `IG perfil @${handle}`,
          );
          if (!env.success) return [];
          const items = env.data?.items ?? [];
          const inputUrl = urlPerfilInstagram(handle);
          const mapeados = items
            .map((it) => mapearPostInstagram(it, inputUrl))
            .filter((x): x is PostInstagramColetado => x !== null);
          return filtrarRecentes(mapeados, corteMs).slice(0, limite);
        } catch (error) {
          console.error(
            "[socialcrawl] IG perfil:",
            error instanceof Error ? error.message : error,
          );
          return [];
        }
      })(),
    );
  }

  for (const hashtag of termos) {
    jobs.push(
      (async () => {
        try {
          const env = await scGet<SCListData<SCPost>>(
            "/instagram/search/hashtag",
            { hashtag },
            `IG hashtag #${hashtag}`,
          );
          if (!env.success) return [];
          const items = env.data?.items ?? [];
          const inputUrl = urlHashtagInstagram(hashtag);
          const mapeados = items
            .map((it) => mapearPostInstagram(it, inputUrl))
            .filter((x): x is PostInstagramColetado => x !== null);
          return filtrarRecentes(mapeados, corteMs).slice(0, limite);
        } catch (error) {
          console.error(
            "[socialcrawl] IG hashtag:",
            error instanceof Error ? error.message : error,
          );
          return [];
        }
      })(),
    );
  }

  const grupos = await Promise.all(jobs);
  return grupos.flat();
}

export interface ArtigoWebColetado {
  url: string;
  titulo: string;
  fonte: string;
  dominio: string;
  publicadoEm: Date | null;
  snippet: string;
  imagemUrl: string | null;
  searchTerm: string;
}

interface SCNewsArticle {
  title?: string | null;
  url?: string | null;
  source?: string | null;
  published_at?: string | null;
  snippet?: string | null;
  media?:
    | {
        thumbnail_url?: string | null;
        image_url?: string | null;
      }
    | string
    | null;
  ext?: {
    domain?: string | null;
    host?: string | null;
    thumbnail_url?: string | null;
  } | null;
}

function extrairDominio(url: string, fallbackDominio: string | null): string {
  if (fallbackDominio && fallbackDominio.trim()) return fallbackDominio.trim().toLowerCase();
  try {
    return new URL(url).host.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function extrairThumb(media: SCNewsArticle["media"], ext: SCNewsArticle["ext"]): string | null {
  if (typeof media === "string" && media) return media;
  if (media && typeof media === "object") {
    return media.thumbnail_url ?? media.image_url ?? null;
  }
  return ext?.thumbnail_url ?? null;
}

function mapearArtigoNews(
  item: SCNewsArticle,
  searchTerm: string,
): ArtigoWebColetado | null {
  const url = (item.url ?? "").trim();
  if (!url) return null;

  return {
    url,
    titulo: (item.title ?? "").trim(),
    fonte: (item.source ?? "").trim(),
    dominio: extrairDominio(url, item.ext?.domain ?? item.ext?.host ?? null),
    publicadoEm: item.published_at ? new Date(item.published_at) : null,
    snippet: (item.snippet ?? "").trim(),
    imagemUrl: extrairThumb(item.media, item.ext),
    searchTerm,
  };
}

/**
 * Busca notícias por termo no Google News via SocialCrawl.
 * 1 crédito por chamada, retorna até `depth` artigos por termo.
 */
export async function coletarGoogleNewsSC(
  termos: string[],
  opts: { depth?: number; language?: string; location?: string; timeRange?: string } = {},
): Promise<ArtigoWebColetado[]> {
  if (!isSocialCrawlConfigured()) {
    throw new Error("SocialCrawl não configurado no servidor");
  }

  const unicos = [...new Set(termos.map((t) => t.trim()).filter(Boolean))];
  if (unicos.length === 0) return [];

  const depth = Math.min(Math.max(opts.depth ?? 20, 1), 100);
  const language = opts.language ?? "pt-BR";
  const location = opts.location ?? "Brazil";
  const timeRange = opts.timeRange ?? "day";

  const jobs = unicos.map(async (termo) => {
    try {
      const env = await scGet<SCListData<SCNewsArticle>>(
        "/google_news/search",
        {
          keyword: termo,
          depth: String(depth),
          language_code: language,
          location_name: location,
          time_range: timeRange,
        },
        `Google News "${termo}"`,
      );
      if (!env.success) return [];
      const items = env.data?.items ?? [];
      return items
        .map((it) => mapearArtigoNews(it, termo))
        .filter((x): x is ArtigoWebColetado => x !== null);
    } catch (error) {
      console.error(
        "[socialcrawl] Google News:",
        error instanceof Error ? error.message : error,
      );
      return [];
    }
  });

  const grupos = await Promise.all(jobs);
  return grupos.flat();
}

/**
 * Busca tweets por termo via SocialCrawl.
 * 1 crédito por termo, até 20 tweets por página em ordem cronológica desc.
 */
export async function coletarTweetsXSC(
  termos: string[],
  opts: { limiteTotal?: number } = {},
): Promise<TweetColetado[]> {
  if (!isSocialCrawlConfigured()) {
    throw new Error("SocialCrawl não configurado no servidor");
  }

  const unicos = [...new Set(termos.map((t) => t.trim()).filter(Boolean))];
  if (unicos.length === 0) return [];

  // limiteTotal antes era global (Apify soma tudo); aqui distribuímos entre termos.
  const total = Math.max(opts.limiteTotal ?? 8, unicos.length);
  const porTermo = Math.max(Math.ceil(total / unicos.length), 3);

  const jobs = unicos.map(async (termo) => {
    try {
      const env = await scGet<SCListData<SCTweet>>(
        "/twitter/search/tweets",
        { query: termo },
        `X termo "${termo}"`,
      );
      if (!env.success) return [];
      const items = env.data?.items ?? [];
      const mapeados = items
        .map((it) => mapearTweet(it, termo))
        .filter((x): x is TweetColetado => x !== null);
      return mapeados.slice(0, porTermo);
    } catch (error) {
      console.error(
        "[socialcrawl] X:",
        error instanceof Error ? error.message : error,
      );
      return [];
    }
  });

  const grupos = await Promise.all(jobs);
  return grupos.flat();
}
