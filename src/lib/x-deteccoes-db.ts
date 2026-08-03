import { getPool, isDatabaseConfigured } from "@/lib/db";
import { normalizeText } from "@/lib/text-normalize";

export interface XPalavraDeteccao {
  id: number;
  palavra_chave_id: number | null;
  post_db_id: number;
  termo: string;
  contexto: string;
  detectado_em: string;
  post_url: string;
  publicado_em: string | null;
  autor_username: string;
  busca_termo: string | null;
}

export async function registrarDeteccaoX(input: {
  palavraChaveId: number | null;
  postDbId: number;
  termo: string;
  contexto: string;
}): Promise<XPalavraDeteccao | null> {
  if (!isDatabaseConfigured()) return null;

  const duplicata = await getPool().query<{ id: number }>(
    `SELECT id
     FROM x_palavra_deteccoes
     WHERE post_db_id = $1 AND termo = $2
     LIMIT 1`,
    [input.postDbId, input.termo],
  );

  if (duplicata.rows[0]) {
    return obterDeteccaoXPorId(duplicata.rows[0].id);
  }

  const result = await getPool().query<{ id: number }>(
    `INSERT INTO x_palavra_deteccoes (palavra_chave_id, post_db_id, termo, contexto)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [input.palavraChaveId, input.postDbId, input.termo, input.contexto],
  );

  const id = result.rows[0]?.id;
  if (!id) return null;
  return obterDeteccaoXPorId(id);
}

export async function obterDeteccaoXPorId(id: number): Promise<XPalavraDeteccao | null> {
  if (!isDatabaseConfigured()) return null;

  const result = await getPool().query<XPalavraDeteccao>(
    `SELECT
       d.id,
       d.palavra_chave_id,
       d.post_db_id,
       d.termo,
       d.contexto,
       d.detectado_em,
       posts.url AS post_url,
       posts.publicado_em,
       posts.autor_username,
       b.termo AS busca_termo
     FROM x_palavra_deteccoes d
     JOIN x_posts posts ON posts.id = d.post_db_id
     LEFT JOIN x_buscas b ON b.id = posts.busca_id
     WHERE d.id = $1`,
    [id],
  );

  return result.rows[0] ?? null;
}

function termoBuscaSql(termo?: string): { ilike: string | null; normalizado: string | null } {
  const trimmed = termo?.trim();
  if (!trimmed) return { ilike: null, normalizado: null };
  return {
    ilike: `%${trimmed}%`,
    normalizado: `%${normalizeText(trimmed)}%`,
  };
}

export async function contarDeteccoesX(params: { termo?: string }): Promise<number> {
  if (!isDatabaseConfigured()) return 0;

  const busca = termoBuscaSql(params.termo);
  const result = await getPool().query<{ total: string }>(
    `SELECT COUNT(*)::text AS total
     FROM x_palavra_deteccoes d
     JOIN x_posts posts ON posts.id = d.post_db_id
     WHERE (
       $1::text IS NULL
       OR d.termo ILIKE $1
       OR d.contexto ILIKE $1
       OR posts.texto ILIKE $1
       OR posts.autor_username ILIKE $1
       OR translate(lower(d.termo), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $2
       OR translate(lower(d.contexto), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $2
     )`,
    [busca.ilike, busca.normalizado],
  );

  return Number(result.rows[0]?.total ?? 0);
}

export async function buscarDeteccoesX(params: {
  termo?: string;
  limite?: number;
  offset?: number;
}): Promise<XPalavraDeteccao[]> {
  if (!isDatabaseConfigured()) return [];

  const limite = Math.min(Math.max(params.limite ?? 20, 1), 100);
  const offset = Math.max(params.offset ?? 0, 0);
  const busca = termoBuscaSql(params.termo);

  const result = await getPool().query<XPalavraDeteccao>(
    `SELECT
       d.id,
       d.palavra_chave_id,
       d.post_db_id,
       d.termo,
       d.contexto,
       d.detectado_em,
       posts.url AS post_url,
       posts.publicado_em,
       posts.autor_username,
       b.termo AS busca_termo
     FROM x_palavra_deteccoes d
     JOIN x_posts posts ON posts.id = d.post_db_id
     LEFT JOIN x_buscas b ON b.id = posts.busca_id
     WHERE (
       $1::text IS NULL
       OR d.termo ILIKE $1
       OR d.contexto ILIKE $1
       OR posts.texto ILIKE $1
       OR posts.autor_username ILIKE $1
       OR translate(lower(d.termo), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $2
       OR translate(lower(d.contexto), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $2
     )
     ORDER BY d.detectado_em DESC
     LIMIT $3 OFFSET $4`,
    [busca.ilike, busca.normalizado, limite, offset],
  );

  return result.rows;
}
