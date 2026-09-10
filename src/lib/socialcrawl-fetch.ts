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

type ProviderIG = "apify" | "socialcrawl";
type ProviderX = "apify" | "socialcrawl";

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
      if (tentativa >= MAX_TENTATIVAS - 1) {
        throw new Error(`SocialCrawl ${rotulo}: HTTP ${res.status}`);
      }
      tentativa += 1;
      await esperar(1500 * tentativa);
      continue;
    }

    const body = (await res.json().catch(() => ({}))) as SCEnvelope<T>;
    if (!body.success) {
      // 404 típico de perfil privado/inexistente: crédito é devolvido, retorna vazio.
      const err = body.error;
      if (err?.type === "RESOURCE_NOT_FOUND") {
        console.info(
          `[socialcrawl] ${rotulo}: ${err.details?.reason ?? "não encontrado"} (sem cobrança)`,
        );
        return body;
      }
      throw new Error(
        `SocialCrawl ${rotulo}: ${err?.type ?? "falha"} ${err?.message ?? ""}`.trim(),
      );
    }
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
