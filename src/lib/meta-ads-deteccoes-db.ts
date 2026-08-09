import { getPool, isDatabaseConfigured } from "@/lib/db";
import { normalizeText } from "@/lib/text-normalize";

export interface MetaAdsPalavraDeteccao {
  id: number;
  palavra_chave_id: number | null;
  ad_db_id: number;
  termo: string;
  contexto: string;
  detectado_em: string;
  ad_url: string;
  page_name: string;
  ad_titulo: string;
  busca_termo: string | null;
  inicio_em: string | null;
}

export async function registrarDeteccaoMetaAds(input: {
  palavraChaveId: number | null;
  adDbId: number;
  termo: string;
  contexto: string;
}): Promise<MetaAdsPalavraDeteccao | null> {
  if (!isDatabaseConfigured()) return null;

  const duplicata = await getPool().query<{ id: number }>(
    `SELECT id
     FROM meta_ads_palavra_deteccoes
     WHERE ad_db_id = $1 AND termo = $2
     LIMIT 1`,
    [input.adDbId, input.termo],
  );

  if (duplicata.rows[0]) {
    return obterDeteccaoMetaAdsPorId(duplicata.rows[0].id);
  }

  const result = await getPool().query<{ id: number }>(
    `INSERT INTO meta_ads_palavra_deteccoes (palavra_chave_id, ad_db_id, termo, contexto)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [input.palavraChaveId, input.adDbId, input.termo, input.contexto],
  );

  const id = result.rows[0]?.id;
  if (!id) return null;
  return obterDeteccaoMetaAdsPorId(id);
}

export async function obterDeteccaoMetaAdsPorId(
  id: number,
): Promise<MetaAdsPalavraDeteccao | null> {
  if (!isDatabaseConfigured()) return null;

  const result = await getPool().query<MetaAdsPalavraDeteccao>(
    `SELECT
       d.id,
       d.palavra_chave_id,
       d.ad_db_id,
       d.termo,
       d.contexto,
       d.detectado_em,
       ads.url AS ad_url,
       ads.page_name,
       ads.titulo AS ad_titulo,
       ads.inicio_em,
       b.termo AS busca_termo
     FROM meta_ads_palavra_deteccoes d
     JOIN meta_ads ads ON ads.id = d.ad_db_id
     LEFT JOIN meta_ads_buscas b ON b.id = ads.busca_id
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

export async function contarDeteccoesMetaAds(params: { termo?: string }): Promise<number> {
  if (!isDatabaseConfigured()) return 0;

  const busca = termoBuscaSql(params.termo);
  const result = await getPool().query<{ total: string }>(
    `SELECT COUNT(*)::text AS total
     FROM meta_ads_palavra_deteccoes d
     JOIN meta_ads ads ON ads.id = d.ad_db_id
     WHERE (
       $1::text IS NULL
       OR d.termo ILIKE $1
       OR d.contexto ILIKE $1
       OR ads.texto ILIKE $1
       OR ads.page_name ILIKE $1
       OR translate(lower(d.termo), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $2
       OR translate(lower(d.contexto), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $2
     )`,
    [busca.ilike, busca.normalizado],
  );

  return Number(result.rows[0]?.total ?? 0);
}

export async function buscarDeteccoesMetaAds(params: {
  termo?: string;
  limite?: number;
  offset?: number;
}): Promise<MetaAdsPalavraDeteccao[]> {
  if (!isDatabaseConfigured()) return [];

  const limite = Math.min(Math.max(params.limite ?? 30, 1), 100);
  const offset = Math.max(params.offset ?? 0, 0);
  const busca = termoBuscaSql(params.termo);

  const result = await getPool().query<MetaAdsPalavraDeteccao>(
    `SELECT
       d.id,
       d.palavra_chave_id,
       d.ad_db_id,
       d.termo,
       d.contexto,
       d.detectado_em,
       ads.url AS ad_url,
       ads.page_name,
       ads.titulo AS ad_titulo,
       ads.inicio_em,
       b.termo AS busca_termo
     FROM meta_ads_palavra_deteccoes d
     JOIN meta_ads ads ON ads.id = d.ad_db_id
     LEFT JOIN meta_ads_buscas b ON b.id = ads.busca_id
     WHERE (
       $1::text IS NULL
       OR d.termo ILIKE $1
       OR d.contexto ILIKE $1
       OR ads.texto ILIKE $1
       OR ads.page_name ILIKE $1
       OR translate(lower(d.termo), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $2
       OR translate(lower(d.contexto), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $2
     )
     ORDER BY d.detectado_em DESC
     LIMIT $3 OFFSET $4`,
    [busca.ilike, busca.normalizado, limite, offset],
  );

  return result.rows;
}
