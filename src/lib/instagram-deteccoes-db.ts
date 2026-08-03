import { getPool, isDatabaseConfigured } from "@/lib/db";
import { normalizeText } from "@/lib/text-normalize";

export interface InstagramPalavraDeteccao {
  id: number;
  palavra_chave_id: number | null;
  post_db_id: number;
  comentario_db_id: number | null;
  termo: string;
  contexto: string;
  detectado_em: string;
  post_url: string;
  post_tipo: string;
  publicado_em: string | null;
  perfil_username: string;
  perfil_titulo: string | null;
  busca_termo: string | null;
  comentario_autor: string | null;
}

export async function registrarDeteccaoInstagram(input: {
  palavraChaveId: number | null;
  postDbId: number;
  comentarioDbId?: number | null;
  termo: string;
  contexto: string;
}): Promise<InstagramPalavraDeteccao | null> {
  if (!isDatabaseConfigured()) return null;

  const comentarioDbId = input.comentarioDbId ?? null;

  const duplicata = await getPool().query<{ id: number }>(
    `SELECT id
     FROM instagram_palavra_deteccoes
     WHERE post_db_id = $1
       AND termo = $2
       AND comentario_db_id IS NOT DISTINCT FROM $3
     LIMIT 1`,
    [input.postDbId, input.termo, comentarioDbId],
  );

  if (duplicata.rows[0]) {
    return obterDeteccaoInstagramPorId(duplicata.rows[0].id);
  }

  const result = await getPool().query<{ id: number }>(
    `INSERT INTO instagram_palavra_deteccoes (
       palavra_chave_id, post_db_id, comentario_db_id, termo, contexto
     )
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [input.palavraChaveId, input.postDbId, comentarioDbId, input.termo, input.contexto],
  );

  const id = result.rows[0]?.id;
  if (!id) return null;

  return obterDeteccaoInstagramPorId(id);
}

export async function obterDeteccaoInstagramPorId(
  id: number,
): Promise<InstagramPalavraDeteccao | null> {
  if (!isDatabaseConfigured()) return null;

  const result = await getPool().query<InstagramPalavraDeteccao>(
    `SELECT
       d.id,
       d.palavra_chave_id,
       d.post_db_id,
       d.comentario_db_id,
       d.termo,
       d.contexto,
       d.detectado_em,
       posts.url AS post_url,
       posts.tipo AS post_tipo,
       posts.publicado_em,
       COALESCE(NULLIF(posts.owner_username, ''), p.username, '') AS perfil_username,
       p.titulo AS perfil_titulo,
       b.termo AS busca_termo,
       c.autor_username AS comentario_autor
     FROM instagram_palavra_deteccoes d
     JOIN instagram_posts posts ON posts.id = d.post_db_id
     LEFT JOIN instagram_perfis p ON p.id = posts.perfil_id
     LEFT JOIN instagram_buscas b ON b.id = posts.busca_id
     LEFT JOIN instagram_comentarios c ON c.id = d.comentario_db_id
     WHERE d.id = $1`,
    [id],
  );

  const row = result.rows[0];
  return row ? mapDeteccao(row) : null;
}

function termoBuscaSql(termo?: string): { ilike: string | null; normalizado: string | null } {
  const trimmed = termo?.trim();
  if (!trimmed) return { ilike: null, normalizado: null };

  return {
    ilike: `%${trimmed}%`,
    normalizado: `%${normalizeText(trimmed)}%`,
  };
}

export async function contarDeteccoesInstagram(params: {
  perfilId?: number;
  termo?: string;
}): Promise<number> {
  if (!isDatabaseConfigured()) return 0;

  const busca = termoBuscaSql(params.termo);

  const result = await getPool().query<{ total: string }>(
    `SELECT COUNT(*)::text AS total
     FROM instagram_palavra_deteccoes d
     JOIN instagram_posts posts ON posts.id = d.post_db_id
     LEFT JOIN instagram_perfis p ON p.id = posts.perfil_id
     WHERE ($1::int IS NULL OR posts.perfil_id = $1)
       AND (
         $2::text IS NULL
         OR d.termo ILIKE $2
         OR d.contexto ILIKE $2
         OR posts.owner_username ILIKE $2
         OR p.username ILIKE $2
         OR translate(lower(d.termo), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $3
         OR translate(lower(d.contexto), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $3
       )`,
    [params.perfilId ?? null, busca.ilike, busca.normalizado],
  );

  return Number(result.rows[0]?.total ?? 0);
}

export async function buscarDeteccoesInstagram(params: {
  perfilId?: number;
  termo?: string;
  limite?: number;
  offset?: number;
}): Promise<InstagramPalavraDeteccao[]> {
  if (!isDatabaseConfigured()) return [];

  const limite = Math.min(Math.max(params.limite ?? 50, 1), 200);
  const offset = Math.max(params.offset ?? 0, 0);
  const busca = termoBuscaSql(params.termo);

  const result = await getPool().query<InstagramPalavraDeteccao>(
    `SELECT
       d.id,
       d.palavra_chave_id,
       d.post_db_id,
       d.comentario_db_id,
       d.termo,
       d.contexto,
       d.detectado_em,
       posts.url AS post_url,
       posts.tipo AS post_tipo,
       posts.publicado_em,
       COALESCE(NULLIF(posts.owner_username, ''), p.username, '') AS perfil_username,
       p.titulo AS perfil_titulo,
       b.termo AS busca_termo,
       c.autor_username AS comentario_autor
     FROM instagram_palavra_deteccoes d
     JOIN instagram_posts posts ON posts.id = d.post_db_id
     LEFT JOIN instagram_perfis p ON p.id = posts.perfil_id
     LEFT JOIN instagram_buscas b ON b.id = posts.busca_id
     LEFT JOIN instagram_comentarios c ON c.id = d.comentario_db_id
     WHERE ($1::int IS NULL OR posts.perfil_id = $1)
       AND (
         $2::text IS NULL
         OR d.termo ILIKE $2
         OR d.contexto ILIKE $2
         OR posts.owner_username ILIKE $2
         OR p.username ILIKE $2
         OR translate(lower(d.termo), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $3
         OR translate(lower(d.contexto), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $3
       )
     ORDER BY d.detectado_em DESC
     LIMIT $4 OFFSET $5`,
    [params.perfilId ?? null, busca.ilike, busca.normalizado, limite, offset],
  );

  return result.rows.map(mapDeteccao);
}

/** Publicações com legenda para reescanear quando novas palavras-chave forem cadastradas. */
export async function listarPostsInstagramParaReescanear(
  limite = 10,
  offset = 0,
): Promise<number[]> {
  if (!isDatabaseConfigured()) return [];

  const result = await getPool().query<{ id: number }>(
    `SELECT id
     FROM instagram_posts
     WHERE legenda <> ''
     ORDER BY publicado_em DESC NULLS LAST, id DESC
     LIMIT $1 OFFSET $2`,
    [limite, offset],
  );

  return result.rows.map((row) => row.id);
}

function mapDeteccao(row: InstagramPalavraDeteccao): InstagramPalavraDeteccao {
  return {
    ...row,
    detectado_em: new Date(row.detectado_em).toISOString(),
    publicado_em: row.publicado_em ? new Date(row.publicado_em).toISOString() : null,
  };
}
