import { getPool, isDatabaseConfigured } from "@/lib/db";
import { normalizeText } from "@/lib/text-normalize";
import type { WebPalavraDeteccao } from "@/lib/web-db";

export async function registrarDeteccaoWeb(input: {
  palavraChaveId: number | null;
  publicacaoId: number;
  termo: string;
  contexto: string;
  ancoraTermo?: string | null;
}): Promise<WebPalavraDeteccao | null> {
  if (!isDatabaseConfigured()) return null;

  const duplicata = await getPool().query<{ id: number }>(
    `SELECT id
     FROM web_palavra_deteccoes
     WHERE publicacao_id = $1 AND termo = $2
     LIMIT 1`,
    [input.publicacaoId, input.termo],
  );

  if (duplicata.rows[0]) {
    return obterDeteccaoWebPorId(duplicata.rows[0].id);
  }

  const result = await getPool().query<{ id: number }>(
    `INSERT INTO web_palavra_deteccoes (palavra_chave_id, publicacao_id, termo, contexto, ancora_termo)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      input.palavraChaveId,
      input.publicacaoId,
      input.termo,
      input.contexto,
      input.ancoraTermo?.trim() || "",
    ],
  );

  const id = result.rows[0]?.id;
  if (!id) return null;
  return obterDeteccaoWebPorId(id);
}

export async function obterDeteccaoWebPorId(
  id: number,
): Promise<WebPalavraDeteccao | null> {
  if (!isDatabaseConfigured()) return null;

  const result = await getPool().query<WebPalavraDeteccao>(
    `SELECT
       d.id,
       d.palavra_chave_id,
       d.publicacao_id,
       d.termo,
       COALESCE(d.ancora_termo, '') AS ancora_termo,
       d.contexto,
       d.detectado_em,
       p.url,
       p.titulo,
       p.fonte,
       p.dominio,
       p.publicado_em
     FROM web_palavra_deteccoes d
     JOIN web_publicacoes p ON p.id = d.publicacao_id
     WHERE d.id = $1`,
    [id],
  );

  return result.rows[0] ?? null;
}

function termoBuscaSql(termo?: string): {
  ilike: string | null;
  normalizado: string | null;
} {
  const trimmed = termo?.trim();
  if (!trimmed) return { ilike: null, normalizado: null };
  return {
    ilike: `%${trimmed}%`,
    normalizado: `%${normalizeText(trimmed)}%`,
  };
}

export async function contarDeteccoesWeb(params: { termo?: string }): Promise<number> {
  if (!isDatabaseConfigured()) return 0;

  const busca = termoBuscaSql(params.termo);
  const result = await getPool().query<{ total: string }>(
    `SELECT COUNT(*)::text AS total
     FROM web_palavra_deteccoes d
     JOIN web_publicacoes p ON p.id = d.publicacao_id
     WHERE (
       $1::text IS NULL
       OR d.termo ILIKE $1
       OR d.contexto ILIKE $1
       OR p.titulo ILIKE $1
       OR p.snippet ILIKE $1
       OR p.fonte ILIKE $1
       OR translate(lower(d.termo), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $2
       OR translate(lower(d.contexto), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $2
     )`,
    [busca.ilike, busca.normalizado],
  );

  return Number(result.rows[0]?.total ?? 0);
}

export async function buscarDeteccoesWeb(params: {
  termo?: string;
  limite?: number;
  offset?: number;
}): Promise<WebPalavraDeteccao[]> {
  if (!isDatabaseConfigured()) return [];

  const limite = Math.min(Math.max(params.limite ?? 20, 1), 100);
  const offset = Math.max(params.offset ?? 0, 0);
  const busca = termoBuscaSql(params.termo);

  const result = await getPool().query<WebPalavraDeteccao>(
    `SELECT
       d.id,
       d.palavra_chave_id,
       d.publicacao_id,
       d.termo,
       COALESCE(d.ancora_termo, '') AS ancora_termo,
       d.contexto,
       d.detectado_em,
       p.url,
       p.titulo,
       p.fonte,
       p.dominio,
       p.publicado_em
     FROM web_palavra_deteccoes d
     JOIN web_publicacoes p ON p.id = d.publicacao_id
     WHERE (
       $1::text IS NULL
       OR d.termo ILIKE $1
       OR d.contexto ILIKE $1
       OR p.titulo ILIKE $1
       OR p.snippet ILIKE $1
       OR p.fonte ILIKE $1
       OR translate(lower(d.termo), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $2
       OR translate(lower(d.contexto), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $2
     )
     ORDER BY d.detectado_em DESC
     LIMIT $3 OFFSET $4`,
    [busca.ilike, busca.normalizado, limite, offset],
  );

  return result.rows;
}
