/**
 * Coleta de publicações/comentários públicos do Instagram via Apify.
 * O nome do provedor nunca aparece na dashboard — aqui é só infra.
 *
 * - Perfis: apify/instagram-scraper
 * - Hashtags/termos: apify/instagram-hashtag-scraper (o scraper genérico
 *   devolve metadados da tag, não os posts)
 * - Comentários: apify/instagram-comment-scraper
 */

const APIFY_BASE = "https://api.apify.com/v2";
const ACTOR_PERFIS_ID = "apify~instagram-scraper";
const ACTOR_HASHTAGS_ID = "apify~instagram-hashtag-scraper";
const ACTOR_COMENTARIOS_ID = "apify~instagram-comment-scraper";
const FETCH_TIMEOUT_MS = 4 * 60 * 1000;

export interface PostInstagramColetado {
  postId: string;
  shortCode: string;
  url: string;
  tipo: string;
  legenda: string;
  publicadoEm: Date | null;
  ownerUsername: string;
  videoUrl: string | null;
  imagemUrl: string | null;
  curtidas: number | null;
  comentarios: number | null;
  /** URL de origem informada ao coletor (perfil ou hashtag) — usada para atribuir a fonte. */
  inputUrl: string;
}

interface ApifyPostItem {
  id?: string;
  shortCode?: string;
  url?: string;
  type?: string;
  caption?: string;
  timestamp?: string;
  ownerUsername?: string;
  videoUrl?: string;
  displayUrl?: string;
  likesCount?: number;
  commentsCount?: number;
  inputUrl?: string;
  error?: string;
}

export function getInstagramFetchToken(): string {
  return process.env.APIFY_TOKEN?.trim() ?? "";
}

export function isInstagramFetchConfigured(): boolean {
  return Boolean(getInstagramFetchToken());
}

/** Aceita "@usuario", "usuario" ou URL (instagram.com/usuario, com query/paths extras). */
export function extrairUsernameInstagram(entrada: string): string | null {
  const valor = entrada.trim();
  if (!valor) return null;

  let candidato = valor;

  if (/instagram\.com/i.test(valor)) {
    try {
      const url = new URL(valor.startsWith("http") ? valor : `https://${valor}`);
      const partes = url.pathname.split("/").filter(Boolean);
      // Ignora rotas de conteúdo (p/, reel/, stories/, explore/)
      if (partes.length === 0 || ["p", "reel", "reels", "stories", "explore", "tv"].includes(partes[0].toLowerCase())) {
        return null;
      }
      candidato = partes[0];
    } catch {
      return null;
    }
  }

  candidato = candidato.replace(/^@/, "").toLowerCase();

  return /^[a-z0-9._]{1,30}$/.test(candidato) ? candidato : null;
}

/**
 * Aceita termo de monitoramento:
 * - hashtag: "eleicoes" / "#eleicoes" (uma palavra)
 * - frase: "fabio mitidieri" (várias palavras — busca em legendas/comentários)
 */
export function extrairTermoInstagram(entrada: string): string | null {
  const candidato = entrada
    .trim()
    .replace(/^#/, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!candidato || candidato.length > 120) return null;
  // Letras (com acento), números, _, ponto e espaços entre palavras.
  if (!/^[\p{L}\p{N}_.]+(?: [\p{L}\p{N}_.]+)*$/u.test(candidato)) return null;
  return candidato;
}

/** Termo sem espaço = pode coletar como hashtag no Instagram. */
export function termoInstagramEhHashtag(termo: string): boolean {
  return Boolean(termo) && !/\s/.test(termo);
}

export function urlPerfilInstagram(username: string): string {
  return `https://www.instagram.com/${username}/`;
}

export function urlHashtagInstagram(termo: string): string {
  return `https://www.instagram.com/explore/tags/${encodeURIComponent(termo)}/`;
}

/** Normaliza URL de origem para matching (barra final, host, case). */
export function normalizarUrlInstagram(url: string): string {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}

/** Extrai o termo de uma URL /explore/tags/<termo>. */
export function extrairTermoDeUrlHashtag(url: string): string | null {
  const match = /\/explore\/tags\/([^/?#]+)/i.exec(url);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]).toLowerCase();
  } catch {
    return match[1].toLowerCase();
  }
}

export interface OpcoesColetaInstagram {
  limitePorFonte?: number;
}

async function chamarActorDataset(
  actorId: string,
  input: Record<string, unknown>,
  rotulo: string,
): Promise<ApifyPostItem[]> {
  const token = getInstagramFetchToken();
  if (!token) {
    throw new Error("Coleta do Instagram não configurada no servidor");
  }

  const url = `${APIFY_BASE}/acts/${actorId}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&format=json`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    const detalhe = await res.text().catch(() => "");
    console.error(`[instagram] ${rotulo}:`, res.status, detalhe.slice(0, 300));
    throw new Error(`Coleta do Instagram falhou (HTTP ${res.status})`);
  }

  const items = (await res.json()) as ApifyPostItem[];
  return Array.isArray(items) ? items : [];
}

/**
 * Coleta publicações de perfis e/ou termos (hashtags).
 * Actors separados: misturar hashtag no scraper de perfil devolve metadados
 * da tag em vez dos posts — por isso as chamadas são independentes.
 */
export async function coletarPostsInstagram(
  fontes: { perfis?: string[]; termos?: string[] },
  opts: OpcoesColetaInstagram = {},
): Promise<PostInstagramColetado[]> {
  const limite = Math.min(Math.max(opts.limitePorFonte ?? 10, 1), 50);
  const perfis = fontes.perfis ?? [];
  const termos = fontes.termos ?? [];
  if (perfis.length === 0 && termos.length === 0) return [];

  const jobs: Promise<ApifyPostItem[]>[] = [];

  if (perfis.length > 0) {
    jobs.push(
      chamarActorDataset(
        ACTOR_PERFIS_ID,
        {
          directUrls: perfis.map(urlPerfilInstagram),
          resultsType: "posts",
          resultsLimit: limite,
          addParentData: false,
        },
        "coleta de perfis",
      ),
    );
  }

  if (termos.length > 0) {
    jobs.push(
      chamarActorDataset(
        ACTOR_HASHTAGS_ID,
        {
          hashtags: termos,
          resultsLimit: limite,
        },
        "coleta de termos",
      ),
    );
  }

  const lotes = await Promise.all(jobs);
  const posts = normalizarPosts(lotes.flat());
  console.warn(
    `[instagram] coleta: ${posts.length} publicação(ões) útil(is) de ${lotes.flat().length} item(ns)`,
  );
  return posts;
}

function normalizarPosts(items: ApifyPostItem[]): PostInstagramColetado[] {
  const posts: PostInstagramColetado[] = [];
  let descartados = 0;

  for (const item of items) {
    // Metadados de hashtag (id = nome da tag, sem owner) e erros no_items.
    if (item.error || !item.id || !item.ownerUsername || !item.shortCode) {
      descartados += 1;
      continue;
    }

    posts.push({
      postId: String(item.id),
      shortCode: item.shortCode,
      url: item.url ?? `https://www.instagram.com/p/${item.shortCode}/`,
      tipo: item.type ?? "",
      legenda: item.caption ?? "",
      publicadoEm: item.timestamp ? new Date(item.timestamp) : null,
      ownerUsername: item.ownerUsername.toLowerCase(),
      videoUrl: item.videoUrl ?? null,
      imagemUrl: item.displayUrl ?? null,
      curtidas: typeof item.likesCount === "number" ? item.likesCount : null,
      comentarios: typeof item.commentsCount === "number" ? item.commentsCount : null,
      inputUrl: item.inputUrl ?? "",
    });
  }

  if (descartados > 0) {
    console.warn(`[instagram] ${descartados} item(ns) descartado(s) (metadado/erro/sem autor)`);
  }

  return posts;
}

export interface ComentarioInstagramColetado {
  comentarioId: string;
  texto: string;
  autorUsername: string;
  publicadoEm: Date | null;
  curtidas: number | null;
  /** shortCode do post de origem, extraído de postUrl/commentUrl/inputUrl. */
  shortCode: string | null;
}

interface ApifyComentarioItem {
  id?: string;
  text?: string;
  ownerUsername?: string;
  timestamp?: string;
  likesCount?: number;
  postUrl?: string;
  commentUrl?: string;
  inputUrl?: string;
  error?: string;
}

/** Extrai o shortCode de URLs como instagram.com/p/XXX/, /reel/XXX/ ou /p/XXX/c/... */
export function extrairShortCodeInstagram(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = /\/(?:p|reel|reels|tv)\/([^/?#]+)/.exec(url);
  return match ? match[1] : null;
}

/**
 * Coleta comentários de várias publicações em uma única execução.
 * Cada item devolvido traz o shortCode do post de origem para atribuição.
 */
export async function coletarComentariosInstagram(
  postUrls: string[],
  opts: { limitePorPost?: number } = {},
): Promise<ComentarioInstagramColetado[]> {
  const token = getInstagramFetchToken();
  if (!token) {
    throw new Error("Coleta do Instagram não configurada no servidor");
  }
  if (postUrls.length === 0) return [];

  const input = {
    directUrls: postUrls,
    resultsLimit: Math.min(Math.max(opts.limitePorPost ?? 20, 1), 100),
  };

  const url = `${APIFY_BASE}/acts/${ACTOR_COMENTARIOS_ID}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&format=json`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    // Detalhe pode citar o provedor — vai só para o log, nunca para a UI.
    const detalhe = await res.text().catch(() => "");
    console.error("[instagram] coleta de comentários:", res.status, detalhe.slice(0, 300));
    throw new Error(`Coleta de comentários falhou (HTTP ${res.status})`);
  }

  const items = (await res.json()) as ApifyComentarioItem[];
  if (!Array.isArray(items)) return [];

  const unicoShortCode =
    postUrls.length === 1 ? extrairShortCodeInstagram(postUrls[0]) : null;

  const comentarios: ComentarioInstagramColetado[] = [];
  for (const item of items) {
    if (item.error || !item.id || !item.text?.trim()) continue;

    comentarios.push({
      comentarioId: item.id,
      texto: item.text,
      autorUsername: (item.ownerUsername ?? "").toLowerCase(),
      publicadoEm: item.timestamp ? new Date(item.timestamp) : null,
      curtidas: typeof item.likesCount === "number" ? item.likesCount : null,
      shortCode:
        extrairShortCodeInstagram(item.postUrl) ??
        extrairShortCodeInstagram(item.commentUrl) ??
        extrairShortCodeInstagram(item.inputUrl) ??
        unicoShortCode,
    });
  }

  return comentarios;
}
