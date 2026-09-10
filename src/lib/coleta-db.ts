import { Pool, type PoolClient } from "pg";

export type ColetaPlataforma =
  | "instagram_perfil"
  | "instagram_hashtag"
  | "x_termo"
  | "meta_termo"
  | "meta_pagina";

export interface ColetaFonte {
  id: number;
  plataforma: ColetaPlataforma;
  chave: string;
  ativo: boolean;
  ultima_verificacao_em: string | null;
  ultimo_erro: string | null;
}

export interface ColetaInstagramPost {
  post_id: string;
  short_code: string;
  url: string;
  tipo: string;
  legenda: string;
  publicado_em: Date | null;
  owner_username: string;
  video_url: string | null;
  imagem_url: string | null;
  curtidas: number | null;
  comentarios: number | null;
  fonte_plataforma: string;
  fonte_chave: string;
}

export interface ColetaXPost {
  tweet_id: string;
  url: string;
  texto: string;
  autor_username: string;
  autor_nome: string;
  publicado_em: Date | null;
  imagem_url: string | null;
  curtidas: number | null;
  retweets: number | null;
  respostas: number | null;
  search_term: string;
}

export interface ColetaMetaAd {
  ad_archive_id: string;
  url: string;
  page_id: string;
  page_name: string;
  page_profile_uri: string;
  texto: string;
  titulo: string;
  cta_text: string;
  link_url: string | null;
  imagem_url: string | null;
  video_url: string | null;
  inicio_em: Date | null;
  fim_em: Date | null;
  search_term: string | null;
  fonte_chave: string;
}

type ColetaGlobal = typeof globalThis & {
  __radio55ColetaPool?: Pool;
};

export function isColetaCompartilhada(): boolean {
  return Boolean(process.env.COLETA_DATABASE_URL?.trim());
}

export function isColetaSomenteConsumir(): boolean {
  return process.env.COLETA_SOMENTE_CONSUMIR === "true";
}

export type PapelColetaApify = "coletor" | "consumidor" | "ausente";

/** Coletor = tem token (Apify ou SocialCrawl). Consumidor = só puxa da base compartilhada. */
export function papelColetaApify(): PapelColetaApify {
  const apifyToken = process.env["APIFY_TOKEN"];
  const scKey = process.env["SOCIALCRAWL_API_KEY"];
  const temApify = typeof apifyToken === "string" && apifyToken.trim().length > 0;
  const temSC = typeof scKey === "string" && scKey.trim().length > 0;
  const temToken = temApify || temSC;

  if (isColetaCompartilhada() && (isColetaSomenteConsumir() || !temToken)) {
    return "consumidor";
  }
  if (temToken) return "coletor";
  return "ausente";
}

export function getColetaPool(): Pool {
  const url = process.env.COLETA_DATABASE_URL?.trim();
  if (!url) throw new Error("COLETA_DATABASE_URL não configurado");

  const globalRef = globalThis as ColetaGlobal;
  if (!globalRef.__radio55ColetaPool) {
    globalRef.__radio55ColetaPool = new Pool({
      connectionString: url,
      max: 3,
      connectionTimeoutMillis: 20_000,
      statement_timeout: 30_000,
      query_timeout: 35_000,
      idleTimeoutMillis: 60_000,
      keepAlive: true,
    });
    globalRef.__radio55ColetaPool.on("error", (err) => {
      console.error("[coleta] erro no pool:", err.message);
    });
  }
  return globalRef.__radio55ColetaPool;
}

export async function initColetaDatabase(): Promise<void> {
  if (!isColetaCompartilhada()) return;

  const pool = getColetaPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS coleta_fontes (
      id SERIAL PRIMARY KEY,
      plataforma TEXT NOT NULL,
      chave TEXT NOT NULL,
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      visto_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ultima_verificacao_em TIMESTAMPTZ,
      ultimo_erro TEXT,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (plataforma, chave)
    );

    CREATE INDEX IF NOT EXISTS idx_coleta_fontes_ativas
      ON coleta_fontes (plataforma, ativo, ultima_verificacao_em);

    CREATE TABLE IF NOT EXISTS coleta_instagram_posts (
      id SERIAL PRIMARY KEY,
      post_id TEXT NOT NULL UNIQUE,
      short_code TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      tipo TEXT NOT NULL DEFAULT '',
      legenda TEXT NOT NULL DEFAULT '',
      publicado_em TIMESTAMPTZ,
      owner_username TEXT NOT NULL DEFAULT '',
      video_url TEXT,
      imagem_url TEXT,
      curtidas INTEGER,
      comentarios INTEGER,
      fonte_plataforma TEXT NOT NULL DEFAULT '',
      fonte_chave TEXT NOT NULL DEFAULT '',
      coletado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_coleta_ig_owner
      ON coleta_instagram_posts (lower(owner_username), coletado_em DESC);
    CREATE INDEX IF NOT EXISTS idx_coleta_ig_fonte
      ON coleta_instagram_posts (fonte_plataforma, lower(fonte_chave), coletado_em DESC);

    CREATE TABLE IF NOT EXISTS coleta_x_posts (
      id SERIAL PRIMARY KEY,
      tweet_id TEXT NOT NULL UNIQUE,
      url TEXT NOT NULL DEFAULT '',
      texto TEXT NOT NULL DEFAULT '',
      autor_username TEXT NOT NULL DEFAULT '',
      autor_nome TEXT NOT NULL DEFAULT '',
      publicado_em TIMESTAMPTZ,
      imagem_url TEXT,
      curtidas INTEGER,
      retweets INTEGER,
      respostas INTEGER,
      search_term TEXT NOT NULL DEFAULT '',
      coletado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_coleta_x_termo
      ON coleta_x_posts (lower(search_term), coletado_em DESC);

    CREATE TABLE IF NOT EXISTS coleta_meta_ads (
      id SERIAL PRIMARY KEY,
      ad_archive_id TEXT NOT NULL UNIQUE,
      url TEXT NOT NULL DEFAULT '',
      page_id TEXT NOT NULL DEFAULT '',
      page_name TEXT NOT NULL DEFAULT '',
      page_profile_uri TEXT NOT NULL DEFAULT '',
      texto TEXT NOT NULL DEFAULT '',
      titulo TEXT NOT NULL DEFAULT '',
      cta_text TEXT NOT NULL DEFAULT '',
      link_url TEXT,
      imagem_url TEXT,
      video_url TEXT,
      inicio_em TIMESTAMPTZ,
      fim_em TIMESTAMPTZ,
      search_term TEXT,
      fonte_chave TEXT NOT NULL DEFAULT '',
      coletado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_coleta_meta_fonte
      ON coleta_meta_ads (lower(fonte_chave), coletado_em DESC);

    CREATE TABLE IF NOT EXISTS coleta_controle (
      id INTEGER PRIMARY KEY,
      forcar_solicitado_em TIMESTAMPTZ,
      coleta_iniciada_em TIMESTAMPTZ,
      coleta_concluida_em TIMESTAMPTZ,
      ultimo_erro TEXT
    );
    INSERT INTO coleta_controle (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
  `);
}

export function intervaloForcarMinutos(): number {
  const raw = Number(process.env.COLETA_FORCAR_INTERVALO_MINUTOS ?? 60);
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 60;
}

export class ColetaCooldownError extends Error {
  retryAfterSegundos: number;

  constructor(retryAfterSegundos: number) {
    const min = Math.max(1, Math.ceil(retryAfterSegundos / 60));
    super(`Aguarde ${min} min para coletar de novo.`);
    this.name = "ColetaCooldownError";
    this.retryAfterSegundos = retryAfterSegundos;
  }
}

let forcarLocalEm: number | null = null;

export function statusForcarColetaLocal(): {
  pode_forcar: boolean;
  retry_after_segundos: number;
  intervalo_minutos: number;
} {
  const intervalo = intervaloForcarMinutos();
  if (!forcarLocalEm) {
    return { pode_forcar: true, retry_after_segundos: 0, intervalo_minutos: intervalo };
  }
  const restante = Math.ceil((forcarLocalEm + intervalo * 60_000 - Date.now()) / 1000);
  return {
    pode_forcar: restante <= 0,
    retry_after_segundos: Math.max(0, restante),
    intervalo_minutos: intervalo,
  };
}

export function reservarForcarColetaLocal(): void {
  const status = statusForcarColetaLocal();
  if (!status.pode_forcar) {
    throw new ColetaCooldownError(status.retry_after_segundos);
  }
  forcarLocalEm = Date.now();
}

export async function statusForcarColeta(): Promise<{
  pode_forcar: boolean;
  retry_after_segundos: number;
  intervalo_minutos: number;
}> {
  const intervalo = intervaloForcarMinutos();
  const result = await getColetaPool().query<{ restante: number | string | null }>(
    `SELECT GREATEST(
       0,
       EXTRACT(EPOCH FROM (
         forcar_solicitado_em + ($1::int * INTERVAL '1 minute') - NOW()
       ))
     ) AS restante
     FROM coleta_controle
     WHERE id = 1`,
    [intervalo],
  );
  const restante = Math.ceil(Number(result.rows[0]?.restante ?? 0));
  return {
    pode_forcar: restante <= 0,
    retry_after_segundos: restante,
    intervalo_minutos: intervalo,
  };
}

export async function solicitarColetaForcada(): Promise<Date> {
  const intervalo = intervaloForcarMinutos();
  const result = await getColetaPool().query<{ forcar_solicitado_em: Date }>(
    `UPDATE coleta_controle
     SET forcar_solicitado_em = NOW()
     WHERE id = 1
       AND (
         forcar_solicitado_em IS NULL
         OR forcar_solicitado_em <= NOW() - ($1::int * INTERVAL '1 minute')
       )
     RETURNING forcar_solicitado_em`,
    [intervalo],
  );
  const pedido = result.rows[0]?.forcar_solicitado_em;
  if (pedido) return pedido;

  const status = await statusForcarColeta();
  if (status.retry_after_segundos > 0) {
    throw new ColetaCooldownError(status.retry_after_segundos);
  }
  throw new Error("coleta_controle ausente");
}

export async function haPedidoColetaForcada(): Promise<boolean> {
  const result = await getColetaPool().query<{ pendente: boolean }>(
    `SELECT forcar_solicitado_em IS NOT NULL
        AND (coleta_concluida_em IS NULL OR coleta_concluida_em < forcar_solicitado_em)
       AS pendente
     FROM coleta_controle
     WHERE id = 1`,
  );
  return result.rows[0]?.pendente === true;
}

export async function marcarColetaIniciada(): Promise<void> {
  await getColetaPool().query(
    `UPDATE coleta_controle SET coleta_iniciada_em = NOW() WHERE id = 1`,
  );
}

export async function marcarColetaConcluida(erro?: string | null): Promise<void> {
  await getColetaPool().query(
    `UPDATE coleta_controle
     SET coleta_concluida_em = NOW(), ultimo_erro = $1
     WHERE id = 1
       AND (forcar_solicitado_em IS NULL OR coleta_iniciada_em >= forcar_solicitado_em)`,
    [erro ?? null],
  );
}

export async function aguardarColetaConcluida(
  desde: Date,
  timeoutMs = 240_000,
): Promise<boolean> {
  const inicio = Date.now();
  while (Date.now() - inicio < timeoutMs) {
    const result = await getColetaPool().query<{ ok: boolean }>(
      `SELECT COALESCE(coleta_concluida_em >= $1::timestamptz, FALSE) AS ok
       FROM coleta_controle
       WHERE id = 1`,
      [desde],
    );
    if (result.rows[0]?.ok) return true;
    await new Promise((resolve) => setTimeout(resolve, 2_500));
  }
  return false;
}

export async function upsertColetaFonte(
  plataforma: ColetaPlataforma,
  chave: string,
): Promise<void> {
  const limpa = chave.trim().toLowerCase();
  if (!limpa) return;

  await getColetaPool().query(
    `INSERT INTO coleta_fontes (plataforma, chave, ativo, visto_em)
     VALUES ($1, $2, TRUE, NOW())
     ON CONFLICT (plataforma, chave) DO UPDATE SET
       ativo = TRUE,
       visto_em = NOW()`,
    [plataforma, limpa],
  );
}

export async function listarFontesAtivas(plataforma?: ColetaPlataforma): Promise<ColetaFonte[]> {
  const result = await getColetaPool().query<ColetaFonte>(
    `SELECT id, plataforma, chave, ativo, ultima_verificacao_em, ultimo_erro
     FROM coleta_fontes
     WHERE ativo = TRUE
       AND ($1::text IS NULL OR plataforma = $1)
     ORDER BY id ASC`,
    [plataforma ?? null],
  );
  return result.rows;
}

export async function marcarFonteVerificada(
  id: number,
  erro?: string | null,
): Promise<void> {
  await getColetaPool().query(
    `UPDATE coleta_fontes
     SET ultima_verificacao_em = NOW(), ultimo_erro = $2
     WHERE id = $1`,
    [id, erro ?? null],
  );
}

export async function desativarFontesSumidas(): Promise<number> {
  const result = await getColetaPool().query(
    `UPDATE coleta_fontes
     SET ativo = FALSE
     WHERE ativo = TRUE
       AND visto_em < NOW() - INTERVAL '7 days'`,
  );
  return result.rowCount ?? 0;
}

export async function upsertColetaInstagramPost(post: ColetaInstagramPost): Promise<void> {
  await getColetaPool().query(
    `INSERT INTO coleta_instagram_posts (
       post_id, short_code, url, tipo, legenda, publicado_em, owner_username,
       video_url, imagem_url, curtidas, comentarios, fonte_plataforma, fonte_chave
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (post_id) DO UPDATE SET
       legenda = EXCLUDED.legenda,
       curtidas = COALESCE(EXCLUDED.curtidas, coleta_instagram_posts.curtidas),
       comentarios = COALESCE(EXCLUDED.comentarios, coleta_instagram_posts.comentarios),
       video_url = COALESCE(EXCLUDED.video_url, coleta_instagram_posts.video_url),
       imagem_url = COALESCE(EXCLUDED.imagem_url, coleta_instagram_posts.imagem_url),
       coletado_em = NOW()`,
    [
      post.post_id,
      post.short_code,
      post.url,
      post.tipo,
      post.legenda,
      post.publicado_em,
      post.owner_username,
      post.video_url,
      post.imagem_url,
      post.curtidas,
      post.comentarios,
      post.fonte_plataforma,
      post.fonte_chave,
    ],
  );
}

export async function upsertColetaXPost(post: ColetaXPost): Promise<void> {
  await getColetaPool().query(
    `INSERT INTO coleta_x_posts (
       tweet_id, url, texto, autor_username, autor_nome, publicado_em,
       imagem_url, curtidas, retweets, respostas, search_term
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (tweet_id) DO UPDATE SET
       texto = EXCLUDED.texto,
       curtidas = COALESCE(EXCLUDED.curtidas, coleta_x_posts.curtidas),
       retweets = COALESCE(EXCLUDED.retweets, coleta_x_posts.retweets),
       respostas = COALESCE(EXCLUDED.respostas, coleta_x_posts.respostas),
       imagem_url = COALESCE(EXCLUDED.imagem_url, coleta_x_posts.imagem_url),
       coletado_em = NOW()`,
    [
      post.tweet_id,
      post.url,
      post.texto,
      post.autor_username,
      post.autor_nome,
      post.publicado_em,
      post.imagem_url,
      post.curtidas,
      post.retweets,
      post.respostas,
      post.search_term,
    ],
  );
}

export async function upsertColetaMetaAd(ad: ColetaMetaAd): Promise<void> {
  await getColetaPool().query(
    `INSERT INTO coleta_meta_ads (
       ad_archive_id, url, page_id, page_name, page_profile_uri, texto, titulo,
       cta_text, link_url, imagem_url, video_url, inicio_em, fim_em, search_term, fonte_chave
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT (ad_archive_id) DO UPDATE SET
       texto = EXCLUDED.texto,
       titulo = EXCLUDED.titulo,
       imagem_url = COALESCE(EXCLUDED.imagem_url, coleta_meta_ads.imagem_url),
       video_url = COALESCE(EXCLUDED.video_url, coleta_meta_ads.video_url),
       fim_em = COALESCE(EXCLUDED.fim_em, coleta_meta_ads.fim_em),
       coletado_em = NOW()`,
    [
      ad.ad_archive_id,
      ad.url,
      ad.page_id,
      ad.page_name,
      ad.page_profile_uri,
      ad.texto,
      ad.titulo,
      ad.cta_text,
      ad.link_url,
      ad.imagem_url,
      ad.video_url,
      ad.inicio_em,
      ad.fim_em,
      ad.search_term,
      ad.fonte_chave,
    ],
  );
}

export async function listarInstagramPostsCompartilhados(input: {
  usernames: string[];
  hashtags: string[];
  dias?: number;
}): Promise<ColetaInstagramPost[]> {
  const usernames = input.usernames.map((u) => u.toLowerCase());
  const hashtags = input.hashtags.map((h) => h.toLowerCase());
  if (usernames.length === 0 && hashtags.length === 0) return [];

  const result = await getColetaPool().query<ColetaInstagramPost>(
    `SELECT post_id, short_code, url, tipo, legenda, publicado_em, owner_username,
            video_url, imagem_url, curtidas, comentarios, fonte_plataforma, fonte_chave
     FROM coleta_instagram_posts
     WHERE coletado_em > NOW() - ($3::int * INTERVAL '1 day')
       AND (
         lower(owner_username) = ANY($1::text[])
         OR (fonte_plataforma = 'instagram_hashtag' AND lower(fonte_chave) = ANY($2::text[]))
       )
     ORDER BY coletado_em DESC
     LIMIT 400`,
    [usernames, hashtags, input.dias ?? 3],
  );
  return result.rows;
}

export async function listarXPostsCompartilhados(input: {
  termos: string[];
  dias?: number;
}): Promise<ColetaXPost[]> {
  const termos = input.termos.map((t) => t.toLowerCase());
  if (termos.length === 0) return [];

  const result = await getColetaPool().query<ColetaXPost>(
    `SELECT tweet_id, url, texto, autor_username, autor_nome, publicado_em,
            imagem_url, curtidas, retweets, respostas, search_term
     FROM coleta_x_posts
     WHERE coletado_em > NOW() - ($2::int * INTERVAL '1 day')
       AND lower(search_term) = ANY($1::text[])
     ORDER BY coletado_em DESC
     LIMIT 400`,
    [termos, input.dias ?? 3],
  );
  return result.rows;
}

export async function listarMetaAdsCompartilhados(input: {
  termos: string[];
  paginas: string[];
  dias?: number;
}): Promise<ColetaMetaAd[]> {
  const termos = input.termos.map((t) => t.toLowerCase());
  const paginas = input.paginas.map((p) => p.toLowerCase());
  if (termos.length === 0 && paginas.length === 0) return [];

  const result = await getColetaPool().query<ColetaMetaAd>(
    `SELECT ad_archive_id, url, page_id, page_name, page_profile_uri, texto, titulo,
            cta_text, link_url, imagem_url, video_url, inicio_em, fim_em, search_term, fonte_chave
     FROM coleta_meta_ads
     WHERE coletado_em > NOW() - ($3::int * INTERVAL '1 day')
       AND (
         lower(COALESCE(search_term, '')) = ANY($1::text[])
         OR lower(fonte_chave) = ANY($2::text[])
         OR lower(page_id) = ANY($2::text[])
       )
     ORDER BY coletado_em DESC
     LIMIT 400`,
    [termos, paginas, input.dias ?? 3],
  );
  return result.rows;
}

/** Só um tenant no host vence — trava de sessão no Postgres compartilhado. */
export async function withColetorLock<T>(fn: () => Promise<T>): Promise<T | "ocupado"> {
  const client: PoolClient = await getColetaPool().connect();
  try {
    const locked = await client.query<{ ok: boolean }>(
      `SELECT pg_try_advisory_lock(hashtext('orbit-coleta-apify')) AS ok`,
    );
    if (!locked.rows[0]?.ok) return "ocupado";

    try {
      return await fn();
    } finally {
      await client.query(`SELECT pg_advisory_unlock(hashtext('orbit-coleta-apify'))`);
    }
  } finally {
    client.release();
  }
}
