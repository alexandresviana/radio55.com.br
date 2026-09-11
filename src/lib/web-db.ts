import { getPool, isDatabaseConfigured } from "@/lib/db";
import { normalizeText } from "@/lib/text-normalize";

export interface WebSite {
  id: number;
  dominio: string;
  titulo: string;
  url_entrada: string;
  feed_url: string;
  ativo: boolean;
  ultima_verificacao_em: string | null;
  ultimo_erro: string | null;
  criado_em: string;
  artigos_total?: number;
}

export interface WebPublicacao {
  id: number;
  palavra_chave_id: number | null;
  site_id: number | null;
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

export async function listarWebSites(): Promise<WebSite[]> {
  if (!isDatabaseConfigured()) return [];
  const result = await getPool().query<WebSite & { artigos_total: string }>(
    `SELECT
       s.id, s.dominio, s.titulo, s.url_entrada, s.feed_url, s.ativo,
       s.ultima_verificacao_em, s.ultimo_erro, s.criado_em,
       COUNT(p.id)::text AS artigos_total
     FROM web_sites s
     LEFT JOIN web_publicacoes p ON p.site_id = s.id
     GROUP BY s.id
     ORDER BY s.titulo ASC, s.dominio ASC`,
  );
  return result.rows.map((row) => ({
    ...row,
    ativo: Boolean(row.ativo),
    artigos_total: Number(row.artigos_total),
  }));
}

export async function listarWebSitesAtivos(): Promise<WebSite[]> {
  if (!isDatabaseConfigured()) return [];
  const result = await getPool().query<WebSite>(
    `SELECT id, dominio, titulo, url_entrada, feed_url, ativo,
            ultima_verificacao_em, ultimo_erro, criado_em
     FROM web_sites
     WHERE ativo = TRUE
     ORDER BY id ASC`,
  );
  return result.rows.map((row) => ({ ...row, ativo: Boolean(row.ativo) }));
}

export async function criarWebSite(input: {
  dominio: string;
  titulo: string;
  urlEntrada: string;
  feedUrl: string;
}): Promise<WebSite> {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL não configurado");
  }

  const result = await getPool().query<WebSite>(
    `INSERT INTO web_sites (dominio, titulo, url_entrada, feed_url, ativo)
     VALUES ($1, $2, $3, $4, TRUE)
     RETURNING id, dominio, titulo, url_entrada, feed_url, ativo,
               ultima_verificacao_em, ultimo_erro, criado_em`,
    [input.dominio, input.titulo, input.urlEntrada, input.feedUrl],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Falha ao cadastrar site");
  return { ...row, ativo: Boolean(row.ativo) };
}

export async function atualizarWebSite(
  id: number,
  patch: { ativo?: boolean; titulo?: string; feedUrl?: string },
): Promise<WebSite | null> {
  if (!isDatabaseConfigured()) return null;
  const result = await getPool().query<WebSite>(
    `UPDATE web_sites
     SET
       ativo = COALESCE($2, ativo),
       titulo = COALESCE(NULLIF($3, ''), titulo),
       feed_url = COALESCE(NULLIF($4, ''), feed_url)
     WHERE id = $1
     RETURNING id, dominio, titulo, url_entrada, feed_url, ativo,
               ultima_verificacao_em, ultimo_erro, criado_em`,
    [id, patch.ativo ?? null, patch.titulo ?? null, patch.feedUrl ?? null],
  );
  const row = result.rows[0];
  return row ? { ...row, ativo: Boolean(row.ativo) } : null;
}

export async function removerWebSite(id: number): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  const result = await getPool().query(`DELETE FROM web_sites WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function marcarWebSiteVerificado(
  id: number,
  erro?: string | null,
): Promise<void> {
  if (!isDatabaseConfigured()) return;
  await getPool().query(
    `UPDATE web_sites SET ultima_verificacao_em = NOW(), ultimo_erro = $2 WHERE id = $1`,
    [id, erro ?? null],
  );
}

/** Insere/atualiza um artigo captado do Google News ou de um portal RSS. */
export async function registrarPublicacaoWeb(input: {
  palavraChaveId: number | null;
  siteId?: number | null;
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
         snippet, publicado_em, imagem_url, search_term, site_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (url) DO UPDATE SET
         titulo = COALESCE(NULLIF(EXCLUDED.titulo, ''), web_publicacoes.titulo),
         snippet = COALESCE(NULLIF(EXCLUDED.snippet, ''), web_publicacoes.snippet),
         imagem_url = COALESCE(EXCLUDED.imagem_url, web_publicacoes.imagem_url),
         palavra_chave_id = COALESCE(web_publicacoes.palavra_chave_id, EXCLUDED.palavra_chave_id),
         site_id = COALESCE(web_publicacoes.site_id, EXCLUDED.site_id)
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
      input.siteId ?? null,
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
    `SELECT id, palavra_chave_id, site_id, url, titulo, fonte, dominio, snippet,
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
    `SELECT id, palavra_chave_id, site_id, url, titulo, fonte, dominio, snippet,
            publicado_em, imagem_url, search_term, criado_em
     FROM web_publicacoes
     WHERE (
       $1::text IS NULL
       OR titulo ILIKE $1
       OR snippet ILIKE $1
       OR fonte ILIKE $1
       OR dominio ILIKE $1
       OR search_term ILIKE $1
       OR translate(lower(titulo || ' ' || snippet), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $2
     )
     ORDER BY COALESCE(publicado_em, criado_em) DESC
     LIMIT $3 OFFSET $4`,
    [busca.ilike, busca.normalizado, limite, offset],
  );

  return result.rows;
}

export async function contarPublicacoesWeb(params: { termo?: string }): Promise<number> {
  if (!isDatabaseConfigured()) return 0;
  const busca = termoSql(params.termo);
  const result = await getPool().query<{ total: string }>(
    `SELECT COUNT(*)::text AS total
     FROM web_publicacoes
     WHERE (
       $1::text IS NULL
       OR titulo ILIKE $1
       OR snippet ILIKE $1
       OR fonte ILIKE $1
       OR dominio ILIKE $1
       OR search_term ILIKE $1
       OR translate(lower(titulo || ' ' || snippet), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $2
     )`,
    [busca.ilike, busca.normalizado],
  );
  return Number(result.rows[0]?.total ?? 0);
}
