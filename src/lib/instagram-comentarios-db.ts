import { getPool, isDatabaseConfigured } from "@/lib/db";
import { normalizeText } from "@/lib/text-normalize";

export interface InstagramComentario {
  id: number;
  post_db_id: number;
  comentario_id: string;
  autor_username: string;
  texto: string;
  publicado_em: string | null;
  curtidas: number | null;
  criado_em: string;
  post_url?: string;
  post_username?: string;
}

export interface PostParaColetarComentarios {
  id: number;
  url: string;
  short_code: string;
}

export async function registrarComentarioInstagram(input: {
  postDbId: number;
  comentarioId: string;
  autorUsername: string;
  texto: string;
  publicadoEm: Date | null;
  curtidas: number | null;
}): Promise<{ id: number; novo: boolean } | null> {
  if (!isDatabaseConfigured()) return null;

  const result = await getPool().query<{ id: number; novo: boolean }>(
    `INSERT INTO instagram_comentarios (
       post_db_id, comentario_id, autor_username, texto, publicado_em, curtidas
     )
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (comentario_id) DO UPDATE SET
       curtidas = COALESCE(EXCLUDED.curtidas, instagram_comentarios.curtidas)
     RETURNING id, (xmax = 0) AS novo`,
    [
      input.postDbId,
      input.comentarioId,
      input.autorUsername,
      input.texto,
      input.publicadoEm ? input.publicadoEm.toISOString() : null,
      input.curtidas,
    ],
  );

  const row = result.rows[0];
  if (!row) return null;

  return { id: row.id, novo: Boolean(row.novo) };
}

export async function obterComentarioInstagramPorId(
  id: number,
): Promise<InstagramComentario | null> {
  if (!isDatabaseConfigured()) return null;

  const result = await getPool().query<InstagramComentario>(
    `SELECT
       c.id,
       c.post_db_id,
       c.comentario_id,
       c.autor_username,
       c.texto,
       c.publicado_em,
       c.curtidas,
       c.criado_em,
       posts.url AS post_url
     FROM instagram_comentarios c
     JOIN instagram_posts posts ON posts.id = c.post_db_id
     WHERE c.id = $1`,
    [id],
  );

  const row = result.rows[0];
  return row ? mapComentario(row) : null;
}

function termoBuscaSql(termo?: string): { ilike: string | null; normalizado: string | null } {
  const trimmed = termo?.trim();
  if (!trimmed) return { ilike: null, normalizado: null };

  return {
    ilike: `%${trimmed}%`,
    normalizado: `%${normalizeText(trimmed)}%`,
  };
}

export async function contarComentariosInstagram(params: {
  postDbId?: number;
  termo?: string;
}): Promise<number> {
  if (!isDatabaseConfigured()) return 0;

  const busca = termoBuscaSql(params.termo);

  const result = await getPool().query<{ total: string }>(
    `SELECT COUNT(*)::text AS total
     FROM instagram_comentarios c
     WHERE ($1::int IS NULL OR c.post_db_id = $1)
       AND (
         $2::text IS NULL
         OR c.texto ILIKE $2
         OR c.autor_username ILIKE $2
         OR translate(lower(c.texto), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $3
       )`,
    [params.postDbId ?? null, busca.ilike, busca.normalizado],
  );

  return Number(result.rows[0]?.total ?? 0);
}

export async function buscarComentariosInstagram(params: {
  postDbId?: number;
  termo?: string;
  limite?: number;
  offset?: number;
}): Promise<InstagramComentario[]> {
  if (!isDatabaseConfigured()) return [];

  const limite = Math.min(Math.max(params.limite ?? 20, 1), 200);
  const offset = Math.max(params.offset ?? 0, 0);
  const busca = termoBuscaSql(params.termo);

  const result = await getPool().query<InstagramComentario>(
    `SELECT
       c.id,
       c.post_db_id,
       c.comentario_id,
       c.autor_username,
       c.texto,
       c.publicado_em,
       c.curtidas,
       c.criado_em,
       posts.url AS post_url,
       COALESCE(NULLIF(posts.owner_username, ''), p.username, '') AS post_username
     FROM instagram_comentarios c
     JOIN instagram_posts posts ON posts.id = c.post_db_id
     LEFT JOIN instagram_perfis p ON p.id = posts.perfil_id
     WHERE ($1::int IS NULL OR c.post_db_id = $1)
       AND (
         $2::text IS NULL
         OR c.texto ILIKE $2
         OR c.autor_username ILIKE $2
         OR translate(lower(c.texto), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $3
       )
     ORDER BY c.publicado_em DESC NULLS LAST, c.id DESC
     LIMIT $4 OFFSET $5`,
    [params.postDbId ?? null, busca.ilike, busca.normalizado, limite, offset],
  );

  return result.rows.map(mapComentario);
}

/**
 * Publicações recentes (últimos 3 dias) que ainda não tiveram comentários
 * coletados, ou cuja coleta tem mais de 72h (pacote econômico Apify).
 */
export async function listarPostsParaColetarComentarios(
  limite = 3,
): Promise<PostParaColetarComentarios[]> {
  if (!isDatabaseConfigured()) return [];

  const result = await getPool().query<PostParaColetarComentarios>(
    `SELECT id, url, short_code
     FROM instagram_posts
     WHERE url <> ''
       AND publicado_em IS NOT NULL
       AND publicado_em > NOW() - INTERVAL '3 days'
       AND COALESCE(comentarios, 0) > 0
       AND (
         comentarios_coletados_em IS NULL
         OR comentarios_coletados_em < NOW() - INTERVAL '72 hours'
       )
     ORDER BY
       comentarios_coletados_em ASC NULLS FIRST,
       comentarios DESC NULLS LAST,
       publicado_em DESC
     LIMIT $1`,
    [limite],
  );

  return result.rows;
}

export async function marcarComentariosColetados(postDbId: number): Promise<void> {
  if (!isDatabaseConfigured()) return;

  await getPool().query(
    `UPDATE instagram_posts SET comentarios_coletados_em = NOW() WHERE id = $1`,
    [postDbId],
  );
}

/** Comentários com texto para reescanear quando novas palavras-chave forem cadastradas. */
export async function listarComentariosParaReescanear(
  limite = 20,
  offset = 0,
): Promise<number[]> {
  if (!isDatabaseConfigured()) return [];

  const result = await getPool().query<{ id: number }>(
    `SELECT id
     FROM instagram_comentarios
     WHERE texto <> ''
     ORDER BY publicado_em DESC NULLS LAST, id DESC
     LIMIT $1 OFFSET $2`,
    [limite, offset],
  );

  return result.rows.map((row) => row.id);
}

function mapComentario(row: InstagramComentario): InstagramComentario {
  return {
    ...row,
    publicado_em: row.publicado_em ? new Date(row.publicado_em).toISOString() : null,
    criado_em: new Date(row.criado_em).toISOString(),
    curtidas: row.curtidas !== null ? Number(row.curtidas) : null,
  };
}
