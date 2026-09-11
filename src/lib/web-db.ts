import { getPool, isDatabaseConfigured } from "@/lib/db";
import { normalizeText } from "@/lib/text-normalize";

export interface WebPublicacao {
  id: number;
  palavra_chave_id: number | null;
  url: string;
  titulo: string;
  fonte: string;
  dominio: string;
  snippet: string;
  publicado_em: string | null;
  imagem_url: string | null;
  search_term: string;
  criado_em: string;
}

export interface WebPalavraDeteccao {
  id: number;
  palavra_chave_id: number | null;
  publicacao_id: number;
  termo: string;
  ancora_termo: string;
  contexto: string;
  detectado_em: string;
  url: string;
  titulo: string;
  fonte: string;
  dominio: string;
  publicado_em: string | null;
}

/** Insere/atualiza um artigo captado do Google News. Devolve id + se é novo. */
export async function registrarPublicacaoWeb(input: {
  palavraChaveId: number | null;
  url: string;
  titulo: string;
  fonte: string;
  dominio: string;
  snippet: string;
  publicadoEm: Date | null;
  imagemUrl: string | null;
  searchTerm: string;
}): Promise<{ id: number; novo: boolean; textoMudou: boolean } | null> {
  if (!isDatabaseConfigured()) return null;

  const result = await getPool().query<{
    id: number;
    novo: boolean;
    titulo_anterior: string | null;
    snippet_anterior: string | null;
  }>(
    `WITH existente AS (
       SELECT id, titulo, snippet
       FROM web_publicacoes
       WHERE url = $2
     ),
     upsert AS (
       INSERT INTO web_publicacoes (
         palavra_chave_id, url, titulo, fonte, dominio,
         snippet, publicado_em, imagem_url, search_term
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (url) DO UPDATE SET
         titulo = COALESCE(NULLIF(EXCLUDED.titulo, ''), web_publicacoes.titulo),
         snippet = COALESCE(NULLIF(EXCLUDED.snippet, ''), web_publicacoes.snippet),
         imagem_url = COALESCE(EXCLUDED.imagem_url, web_publicacoes.imagem_url),
         palavra_chave_id = COALESCE(web_publicacoes.palavra_chave_id, EXCLUDED.palavra_chave_id)
       RETURNING id, (xmax = 0) AS novo
     )
     SELECT
       upsert.id,
       upsert.novo,
       existente.titulo AS titulo_anterior,
       existente.snippet AS snippet_anterior
     FROM upsert
     LEFT JOIN existente ON existente.id = upsert.id`,
    [
      input.palavraChaveId,
      input.url,
      input.titulo,
      input.fonte,
      input.dominio,
      input.snippet,
      input.publicadoEm ? input.publicadoEm.toISOString() : null,
      input.imagemUrl,
      input.searchTerm,
    ],
  );

  const row = result.rows[0];
  if (!row) return null;

  const textoAnterior = `${row.titulo_anterior ?? ""} ${row.snippet_anterior ?? ""}`;
  const textoNovo = `${input.titulo} ${input.snippet}`;
  return {
    id: row.id,
    novo: Boolean(row.novo),
    textoMudou: !row.novo && textoAnterior.trim() !== textoNovo.trim(),
  };
}

export async function obterPublicacaoWebPorId(id: number): Promise<WebPublicacao | null> {
  if (!isDatabaseConfigured()) return null;
  const result = await getPool().query<WebPublicacao>(
    `SELECT id, palavra_chave_id, url, titulo, fonte, dominio, snippet,
            publicado_em, imagem_url, search_term, criado_em
     FROM web_publicacoes
     WHERE id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

function termoSql(termo?: string): { ilike: string | null; normalizado: string | null } {
  const trimmed = termo?.trim();
  if (!trimmed) return { ilike: null, normalizado: null };
  return { ilike: `%${trimmed}%`, normalizado: `%${normalizeText(trimmed)}%` };
}

export async function buscarPublicacoesWeb(params: {
  termo?: string;
  limite?: number;
  offset?: number;
}): Promise<WebPublicacao[]> {
  if (!isDatabaseConfigured()) return [];

  const limite = Math.min(Math.max(params.limite ?? 20, 1), 100);
  const offset = Math.max(params.offset ?? 0, 0);
  const busca = termoSql(params.termo);

  const result = await getPool().query<WebPublicacao>(
    `SELECT id, palavra_chave_id, url, titulo, fonte, dominio, snippet,
            publicado_em, imagem_url, search_term, criado_em
     FROM web_publicacoes
     WHERE (
       $1::text IS NULL
       OR titulo ILIKE $1
       OR snippet ILIKE $1
       OR fonte ILIKE $1
       OR search_term ILIKE $1
       OR translate(lower(titulo || ' ' || snippet), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $2
     )
     ORDER BY COALESCE(publicado_em, criado_em) DESC
     LIMIT $3 OFFSET $4`,
    [busca.ilike, busca.normalizado, limite, offset],
  );

  return result.rows;
}
