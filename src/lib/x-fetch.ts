/**
 * Coleta de posts públicos do X via Apify (apidojo/twitter-scraper-lite).
 * O nome do provedor nunca aparece na dashboard — aqui é só infra.
 */

const APIFY_BASE = "https://api.apify.com/v2";
const ACTOR_BUSCA_ID = "apidojo~twitter-scraper-lite";
const FETCH_TIMEOUT_MS = 4 * 60 * 1000;

export interface TweetColetado {
  tweetId: string;
  url: string;
  texto: string;
  autorUsername: string;
  autorNome: string;
  publicadoEm: Date | null;
  curtidas: number | null;
  retweets: number | null;
  respostas: number | null;
  imagemUrl: string | null;
  /** Termo de busca que originou o item (quando conhecido). */
  searchTerm: string;
}

interface ApifyTweetItem {
  id?: string;
  url?: string;
  twitterUrl?: string;
  text?: string;
  full_text?: string;
  createdAt?: string;
  likeCount?: number;
  retweetCount?: number;
  replyCount?: number;
  searchTerm?: string;
  author?: {
    userName?: string;
    username?: string;
    name?: string;
  };
  media?: Array<{ type?: string; url?: string; media_url_https?: string }>;
  extendedEntities?: {
    media?: Array<{ type?: string; media_url_https?: string }>;
  };
  error?: string;
  noResults?: boolean;
}

export function getXFetchToken(): string {
  return process.env.APIFY_TOKEN?.trim() ?? "";
}

export function isXFetchConfigured(): boolean {
  return Boolean(getXFetchToken());
}

/**
 * Aceita termo de monitoramento no X:
 * - palavra: "eleicoes" / "#eleicoes"
 * - frase: "fabio mitidieri"
 */
export function extrairTermoX(entrada: string): string | null {
  const candidato = entrada
    .trim()
    .replace(/^#/, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!candidato || candidato.length > 120) return null;
  if (!/^[\p{L}\p{N}_.]+(?: [\p{L}\p{N}_.]+)*$/u.test(candidato)) return null;
  return candidato;
}

/** Query enviada ao buscador: frases entre aspas para match mais preciso. */
export function queryBuscaX(termo: string): string {
  const limpo = termo.trim();
  if (!limpo) return limpo;
  if (/\s/.test(limpo)) return `"${limpo}"`;
  return limpo;
}

export async function coletarTweetsX(
  termos: string[],
  opts: { limiteTotal?: number } = {},
): Promise<TweetColetado[]> {
  const token = getXFetchToken();
  if (!token) {
    throw new Error("Coleta do X não configurada no servidor");
  }

  const unicos = [...new Set(termos.map((t) => t.trim()).filter(Boolean))];
  if (unicos.length === 0) return [];

  const limite = Math.min(Math.max(opts.limiteTotal ?? 30, 1), 200);
  const searchTerms = unicos.map(queryBuscaX);

  const url = `${APIFY_BASE}/acts/${ACTOR_BUSCA_ID}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&format=json`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      searchTerms,
      maxItems: limite,
      sort: "Latest",
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    const detalhe = await res.text().catch(() => "");
    console.error("[x] coleta:", res.status, detalhe.slice(0, 300));
    throw new Error(`Coleta do X falhou (HTTP ${res.status})`);
  }

  const items = (await res.json()) as ApifyTweetItem[];
  if (!Array.isArray(items)) return [];

  const tweets = normalizarTweets(items, unicos);
  console.warn(`[x] coleta: ${tweets.length} post(s) útil(is) de ${items.length} item(ns)`);
  return tweets;
}

function normalizarTweets(items: ApifyTweetItem[], termosOriginais: string[]): TweetColetado[] {
  const tweets: TweetColetado[] = [];
  const termoFallback = termosOriginais.length === 1 ? termosOriginais[0] : "";

  for (const item of items) {
    if (item.error || item.noResults || !item.id) continue;

    const texto = (item.text ?? item.full_text ?? "").trim();
    const autor =
      item.author?.userName?.toLowerCase() ??
      item.author?.username?.toLowerCase() ??
      "";
    if (!texto && !autor) continue;

    const searchTermRaw = (item.searchTerm ?? "").trim();
    const searchTerm =
      termosOriginais.find(
        (t) =>
          queryBuscaX(t).toLowerCase() === searchTermRaw.toLowerCase() ||
          t.toLowerCase() === searchTermRaw.replace(/^"|"$/g, "").toLowerCase(),
      ) ??
      atribuirTermoPorTexto(texto, termosOriginais) ??
      termoFallback;

    const imagem =
      item.media?.find((m) => m.url || m.media_url_https)?.url ??
      item.media?.find((m) => m.media_url_https)?.media_url_https ??
      item.extendedEntities?.media?.[0]?.media_url_https ??
      null;

    tweets.push({
      tweetId: String(item.id),
      url: item.url ?? item.twitterUrl ?? `https://x.com/i/status/${item.id}`,
      texto,
      autorUsername: autor,
      autorNome: item.author?.name ?? "",
      publicadoEm: item.createdAt ? new Date(item.createdAt) : null,
      curtidas: typeof item.likeCount === "number" ? item.likeCount : null,
      retweets: typeof item.retweetCount === "number" ? item.retweetCount : null,
      respostas: typeof item.replyCount === "number" ? item.replyCount : null,
      imagemUrl: imagem,
      searchTerm,
    });
  }

  return tweets;
}

function atribuirTermoPorTexto(texto: string, termos: string[]): string | null {
  const lower = texto.toLowerCase();
  const ordenados = [...termos].sort((a, b) => b.length - a.length);
  for (const termo of ordenados) {
    if (lower.includes(termo.toLowerCase())) return termo;
  }
  return null;
}
