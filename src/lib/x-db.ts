import { getPool, isDatabaseConfigured } from "@/lib/db";
import { normalizeText } from "@/lib/text-normalize";

export interface XBusca {
  id: number;
  termo: string;
  ativo: boolean;
  ultima_verificacao_em: string | null;
  ultimo_erro: string | null;
  criado_em: string;
  posts_total?: number;
  deteccoes_total?: number;
}

export interface XPost {
  id: number;
  busca_id: number | null;
  autor_username: string;
  autor_nome: string;
  tweet_id: string;
  url: string;
  texto: string;
  publicado_em: string | null;
  imagem_url: string | null;
  curtidas: number | null;
  retweets: number | null;
  respostas: number | null;
  criado_em: string;
  busca_termo?: string | null;
}

export async function listarXBuscas(): Promise<XBusca[]> {
  if (!isDatabaseConfigured()) return [];

  const result = await getPool().query<XBusca & { posts_total: string; deteccoes_total: string }>(
    `SELECT
       b.id,
       b.termo,
       b.ativo,
       b.ultima_verificacao_em,
       b.ultimo_erro,
       b.criado_em,
       COUNT(DISTINCT posts.id)::text AS posts_total,
       (
         SELECT COUNT(*)::text
         FROM x_palavra_deteccoes d
         WHERE lower(d.termo) = lower(b.termo)
            OR lower(d.termo) = lower('#' || b.termo)
       ) AS deteccoes_total
     FROM x_buscas b
     LEFT JOIN x_posts posts ON posts.busca_id = b.id
     GROUP BY b.id
     ORDER BY b.termo ASC`,
  );

  return result.rows.map(mapBusca);
}

export async function listarXBuscasAtivas(): Promise<XBusca[]> {
  if (!isDatabaseConfigured()) return [];

  const result = await getPool().query<XBusca>(
    `SELECT id, termo, ativo, ultima_verificacao_em, ultimo_erro, criado_em
     FROM x_buscas
     WHERE ativo = TRUE
     ORDER BY id ASC`,
  );

  return result.rows.map(mapBusca);
}

export async function criarXBusca(termo: string): Promise<XBusca> {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL não configurado");
  }

  const result = await getPool().query<XBusca>(
    `INSERT INTO x_buscas (termo, ativo)
     VALUES ($1, TRUE)
     RETURNING id, termo, ativo, ultima_verificacao_em, ultimo_erro, criado_em`,
    [termo],
  );

  const row = result.rows[0];
  if (!row) throw new Error("Falha ao cadastrar termo");
  return mapBusca(row);
}

export async function atualizarXBusca(
  id: number,
  patch: { ativo?: boolean },
): Promise<XBusca | null> {
  if (!isDatabaseConfigured()) return null;

  const result = await getPool().query<XBusca>(
    `UPDATE x_buscas
     SET ativo = COALESCE($2, ativo)
     WHERE id = $1
     RETURNING id, termo, ativo, ultima_verificacao_em, ultimo_erro, criado_em`,
    [id, patch.ativo ?? null],
  );

  const row = result.rows[0];
  return row ? mapBusca(row) : null;
}

export async function removerXBusca(id: number): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  const result = await getPool().query(`DELETE FROM x_buscas WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function marcarXBuscaVerificada(id: number, erro?: string | null): Promise<void> {
  if (!isDatabaseConfigured()) return;
  await getPool().query(
    `UPDATE x_buscas SET ultima_verificacao_em = NOW(), ultimo_erro = $2 WHERE id = $1`,
    [id, erro ?? null],
  );
}

export async function registrarPostX(input: {
  buscaId: number | null;
  autorUsername: string;
  autorNome: string;
  tweetId: string;
  url: string;
  texto: string;
  publicadoEm: Date | null;
  imagemUrl: string | null;
  curtidas: number | null;
  retweets: number | null;
  respostas: number | null;
}): Promise<{ id: number; novo: boolean; textoMudou: boolean } | null> {
  if (!isDatabaseConfigured()) return null;

  const result = await getPool().query<{
    id: number;
    novo: boolean;
    texto_anterior: string | null;
  }>(
    `WITH existente AS (
       SELECT id, texto
       FROM x_posts
       WHERE tweet_id = $3
     ),
     fonte AS (
       SELECT
         (SELECT id FROM x_buscas WHERE id = $1) AS busca_id,
         $2::text AS autor_username,
         $3::text AS tweet_id,
         $4::text AS url,
         $5::text AS texto,
         $6::timestamptz AS publicado_em,
         $7::text AS imagem_url,
         $8::int AS curtidas,
         $9::int AS retweets,
         $10::int AS respostas,
         $11::text AS autor_nome
     ),
     upsert AS (
       INSERT INTO x_posts (
         busca_id, autor_username, tweet_id, url, texto,
         publicado_em, imagem_url, curtidas, retweets, respostas, autor_nome
       )
       SELECT
         busca_id, autor_username, tweet_id, url, texto,
         publicado_em, imagem_url, curtidas, retweets, respostas, autor_nome
       FROM fonte
       ON CONFLICT (tweet_id) DO UPDATE SET
         busca_id = COALESCE(
           (SELECT id FROM x_buscas WHERE id = x_posts.busca_id),
           EXCLUDED.busca_id
         ),
         autor_username = CASE
           WHEN x_posts.autor_username = '' THEN EXCLUDED.autor_username
           ELSE x_posts.autor_username
         END,
         autor_nome = CASE
           WHEN x_posts.autor_nome = '' THEN EXCLUDED.autor_nome
           ELSE x_posts.autor_nome
         END,
         texto = EXCLUDED.texto,
         curtidas = COALESCE(EXCLUDED.curtidas, x_posts.curtidas),
         retweets = COALESCE(EXCLUDED.retweets, x_posts.retweets),
         respostas = COALESCE(EXCLUDED.respostas, x_posts.respostas),
         imagem_url = COALESCE(EXCLUDED.imagem_url, x_posts.imagem_url)
       RETURNING id, (xmax = 0) AS novo
     )
     SELECT
       upsert.id,
       upsert.novo,
       existente.texto AS texto_anterior
     FROM upsert
     LEFT JOIN existente ON existente.id = upsert.id`,
    [
      input.buscaId,
      input.autorUsername,
      input.tweetId,
      input.url,
      input.texto,
      input.publicadoEm ? input.publicadoEm.toISOString() : null,
      input.imagemUrl,
      input.curtidas,
      input.retweets,
      input.respostas,
      input.autorNome,
    ],
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    id: row.id,
    novo: Boolean(row.novo),
    textoMudou: !row.novo && (row.texto_anterior ?? "") !== input.texto,
  };
}

export async function obterXPostPorId(id: number): Promise<XPost | null> {
  if (!isDatabaseConfigured()) return null;

  const result = await getPool().query<XPost>(
    `SELECT
       posts.id,
       posts.busca_id,
       posts.autor_username,
       posts.autor_nome,
       posts.tweet_id,
       posts.url,
       posts.texto,
       posts.publicado_em,
       posts.imagem_url,
       posts.curtidas,
       posts.retweets,
       posts.respostas,
       posts.criado_em,
       b.termo AS busca_termo
     FROM x_posts posts
     LEFT JOIN x_buscas b ON b.id = posts.busca_id
     WHERE posts.id = $1`,
    [id],
  );

  return result.rows[0] ? mapPost(result.rows[0]) : null;
}

export async function buscarXPosts(params: {
  termo?: string;
  limite?: number;
  offset?: number;
}): Promise<XPost[]> {
  if (!isDatabaseConfigured()) return [];

  const limite = Math.min(Math.max(params.limite ?? 20, 1), 100);
  const offset = Math.max(params.offset ?? 0, 0);
  const busca = termoSql(params.termo);

  const result = await getPool().query<XPost>(
    `SELECT
       posts.id,
       posts.busca_id,
       posts.autor_username,
       posts.autor_nome,
       posts.tweet_id,
       posts.url,
       posts.texto,
       posts.publicado_em,
       posts.imagem_url,
       posts.curtidas,
       posts.retweets,
       posts.respostas,
       posts.criado_em,
       b.termo AS busca_termo
     FROM x_posts posts
     LEFT JOIN x_buscas b ON b.id = posts.busca_id
     WHERE (
       $1::text IS NULL
       OR posts.texto ILIKE $1
       OR posts.autor_username ILIKE $1
       OR b.termo ILIKE $1
       OR translate(lower(posts.texto), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $2
     )
     ORDER BY COALESCE(posts.publicado_em, posts.criado_em) DESC
     LIMIT $3 OFFSET $4`,
    [busca.ilike, busca.normalizado, limite, offset],
  );

  return result.rows.map(mapPost);
}

export async function contarXPosts(params: { termo?: string }): Promise<number> {
  if (!isDatabaseConfigured()) return 0;

  const busca = termoSql(params.termo);
  const result = await getPool().query<{ total: string }>(
    `SELECT COUNT(*)::text AS total
     FROM x_posts posts
     LEFT JOIN x_buscas b ON b.id = posts.busca_id
     WHERE (
       $1::text IS NULL
       OR posts.texto ILIKE $1
       OR posts.autor_username ILIKE $1
       OR b.termo ILIKE $1
       OR translate(lower(posts.texto), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $2
     )`,
    [busca.ilike, busca.normalizado],
  );

  return Number(result.rows[0]?.total ?? 0);
}

export async function listarXPostsParaReescanear(
  limite: number,
  offset = 0,
): Promise<Array<{ id: number }>> {
  if (!isDatabaseConfigured()) return [];

  const result = await getPool().query<{ id: number }>(
    `SELECT id
     FROM x_posts
     WHERE texto <> ''
     ORDER BY COALESCE(publicado_em, criado_em) DESC
     LIMIT $1 OFFSET $2`,
    [Math.min(Math.max(limite, 1), 100), Math.max(offset, 0)],
  );

  return result.rows;
}

function termoSql(termo?: string): { ilike: string | null; normalizado: string | null } {
  const trimmed = termo?.trim();
  if (!trimmed) return { ilike: null, normalizado: null };
  return {
    ilike: `%${trimmed}%`,
    normalizado: `%${normalizeText(trimmed)}%`,
  };
}

function mapBusca(row: {
  id: number;
  termo: string;
  ativo: boolean;
  ultima_verificacao_em: string | null;
  ultimo_erro: string | null;
  criado_em: string;
  posts_total?: string | number;
  deteccoes_total?: string | number;
}): XBusca {
  return {
    id: row.id,
    termo: row.termo,
    ativo: Boolean(row.ativo),
    ultima_verificacao_em: row.ultima_verificacao_em,
    ultimo_erro: row.ultimo_erro,
    criado_em: row.criado_em,
    posts_total: row.posts_total != null ? Number(row.posts_total) : undefined,
    deteccoes_total: row.deteccoes_total != null ? Number(row.deteccoes_total) : undefined,
  };
}

function mapPost(row: XPost): XPost {
  return {
    ...row,
    curtidas: row.curtidas != null ? Number(row.curtidas) : null,
    retweets: row.retweets != null ? Number(row.retweets) : null,
    respostas: row.respostas != null ? Number(row.respostas) : null,
  };
}
