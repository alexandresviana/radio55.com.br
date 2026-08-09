import { getPool, isDatabaseConfigured } from "@/lib/db";
import { normalizeText } from "@/lib/text-normalize";

export interface MetaAdsBusca {
  id: number;
  termo: string;
  ativo: boolean;
  ultima_verificacao_em: string | null;
  ultimo_erro: string | null;
  criado_em: string;
  anuncios_total?: number;
  deteccoes_total?: number;
}

export interface MetaAdsPagina {
  id: number;
  slug: string;
  titulo: string;
  url_entrada: string;
  ativo: boolean;
  ultima_verificacao_em: string | null;
  ultimo_erro: string | null;
  criado_em: string;
  anuncios_total?: number;
}

export interface MetaAd {
  id: number;
  busca_id: number | null;
  pagina_id: number | null;
  ad_archive_id: string;
  page_id: string;
  page_name: string;
  url: string;
  texto: string;
  titulo: string;
  cta_text: string;
  link_url: string | null;
  imagem_url: string | null;
  video_url: string | null;
  inicio_em: string | null;
  fim_em: string | null;
  criado_em: string;
  busca_termo?: string | null;
  pagina_slug?: string | null;
}

export async function listarMetaAdsBuscas(): Promise<MetaAdsBusca[]> {
  if (!isDatabaseConfigured()) return [];

  const result = await getPool().query<
    MetaAdsBusca & { anuncios_total: string; deteccoes_total: string }
  >(
    `SELECT
       b.id, b.termo, b.ativo, b.ultima_verificacao_em, b.ultimo_erro, b.criado_em,
       COUNT(DISTINCT ads.id)::text AS anuncios_total,
       (
         SELECT COUNT(*)::text
         FROM meta_ads_palavra_deteccoes d
         WHERE lower(d.termo) = lower(b.termo)
       ) AS deteccoes_total
     FROM meta_ads_buscas b
     LEFT JOIN meta_ads ads ON ads.busca_id = b.id
     GROUP BY b.id
     ORDER BY b.termo ASC`,
  );

  return result.rows.map(mapBusca);
}

export async function listarMetaAdsBuscasAtivas(): Promise<MetaAdsBusca[]> {
  if (!isDatabaseConfigured()) return [];

  const result = await getPool().query<MetaAdsBusca>(
    `SELECT id, termo, ativo, ultima_verificacao_em, ultimo_erro, criado_em
     FROM meta_ads_buscas
     WHERE ativo = TRUE
     ORDER BY id ASC`,
  );

  return result.rows.map(mapBusca);
}

export async function criarMetaAdsBusca(termo: string): Promise<MetaAdsBusca> {
  if (!isDatabaseConfigured()) throw new Error("DATABASE_URL não configurado");

  const result = await getPool().query<MetaAdsBusca>(
    `INSERT INTO meta_ads_buscas (termo, ativo)
     VALUES ($1, TRUE)
     RETURNING id, termo, ativo, ultima_verificacao_em, ultimo_erro, criado_em`,
    [termo],
  );

  const row = result.rows[0];
  if (!row) throw new Error("Falha ao cadastrar termo");
  return mapBusca(row);
}

export async function atualizarMetaAdsBusca(
  id: number,
  patch: { ativo?: boolean },
): Promise<MetaAdsBusca | null> {
  if (!isDatabaseConfigured()) return null;

  const result = await getPool().query<MetaAdsBusca>(
    `UPDATE meta_ads_buscas
     SET ativo = COALESCE($2, ativo)
     WHERE id = $1
     RETURNING id, termo, ativo, ultima_verificacao_em, ultimo_erro, criado_em`,
    [id, patch.ativo ?? null],
  );

  return result.rows[0] ? mapBusca(result.rows[0]) : null;
}

export async function removerMetaAdsBusca(id: number): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  const result = await getPool().query(`DELETE FROM meta_ads_buscas WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function marcarMetaAdsBuscaVerificada(
  id: number,
  erro?: string | null,
): Promise<void> {
  if (!isDatabaseConfigured()) return;
  await getPool().query(
    `UPDATE meta_ads_buscas SET ultima_verificacao_em = NOW(), ultimo_erro = $2 WHERE id = $1`,
    [id, erro ?? null],
  );
}

export async function listarMetaAdsPaginas(): Promise<MetaAdsPagina[]> {
  if (!isDatabaseConfigured()) return [];

  const result = await getPool().query<MetaAdsPagina & { anuncios_total: string }>(
    `SELECT
       p.id, p.slug, p.titulo, p.url_entrada, p.ativo,
       p.ultima_verificacao_em, p.ultimo_erro, p.criado_em,
       COUNT(DISTINCT ads.id)::text AS anuncios_total
     FROM meta_ads_paginas p
     LEFT JOIN meta_ads ads ON ads.pagina_id = p.id
     GROUP BY p.id
     ORDER BY p.slug ASC`,
  );

  return result.rows.map(mapPagina);
}

export async function listarMetaAdsPaginasAtivas(): Promise<MetaAdsPagina[]> {
  if (!isDatabaseConfigured()) return [];

  const result = await getPool().query<MetaAdsPagina>(
    `SELECT id, slug, titulo, url_entrada, ativo, ultima_verificacao_em, ultimo_erro, criado_em
     FROM meta_ads_paginas
     WHERE ativo = TRUE
     ORDER BY id ASC`,
  );

  return result.rows.map(mapPagina);
}

export async function criarMetaAdsPagina(input: {
  slug: string;
  urlEntrada: string;
  titulo?: string;
}): Promise<MetaAdsPagina> {
  if (!isDatabaseConfigured()) throw new Error("DATABASE_URL não configurado");

  const result = await getPool().query<MetaAdsPagina>(
    `INSERT INTO meta_ads_paginas (slug, titulo, url_entrada, ativo)
     VALUES ($1, $2, $3, TRUE)
     RETURNING id, slug, titulo, url_entrada, ativo, ultima_verificacao_em, ultimo_erro, criado_em`,
    [input.slug, input.titulo ?? input.slug, input.urlEntrada],
  );

  const row = result.rows[0];
  if (!row) throw new Error("Falha ao cadastrar página");
  return mapPagina(row);
}

export async function atualizarMetaAdsPagina(
  id: number,
  patch: { ativo?: boolean; titulo?: string },
): Promise<MetaAdsPagina | null> {
  if (!isDatabaseConfigured()) return null;

  const result = await getPool().query<MetaAdsPagina>(
    `UPDATE meta_ads_paginas
     SET
       ativo = COALESCE($2, ativo),
       titulo = COALESCE($3, titulo)
     WHERE id = $1
     RETURNING id, slug, titulo, url_entrada, ativo, ultima_verificacao_em, ultimo_erro, criado_em`,
    [id, patch.ativo ?? null, patch.titulo ?? null],
  );

  return result.rows[0] ? mapPagina(result.rows[0]) : null;
}

export async function removerMetaAdsPagina(id: number): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  const result = await getPool().query(`DELETE FROM meta_ads_paginas WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function marcarMetaAdsPaginaVerificada(
  id: number,
  erro?: string | null,
): Promise<void> {
  if (!isDatabaseConfigured()) return;
  await getPool().query(
    `UPDATE meta_ads_paginas SET ultima_verificacao_em = NOW(), ultimo_erro = $2 WHERE id = $1`,
    [id, erro ?? null],
  );
}

export async function registrarMetaAd(input: {
  buscaId: number | null;
  paginaId: number | null;
  adArchiveId: string;
  pageId: string;
  pageName: string;
  url: string;
  texto: string;
  titulo: string;
  ctaText: string;
  linkUrl: string | null;
  imagemUrl: string | null;
  videoUrl: string | null;
  inicioEm: Date | null;
  fimEm: Date | null;
}): Promise<{ id: number; novo: boolean; textoMudou: boolean } | null> {
  if (!isDatabaseConfigured()) return null;

  const result = await getPool().query<{
    id: number;
    novo: boolean;
    texto_anterior: string | null;
  }>(
    `WITH existente AS (
       SELECT id, texto FROM meta_ads WHERE ad_archive_id = $3
     ),
     upsert AS (
       INSERT INTO meta_ads (
         busca_id, pagina_id, ad_archive_id, page_id, page_name, url,
         texto, titulo, cta_text, link_url, imagem_url, video_url, inicio_em, fim_em
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (ad_archive_id) DO UPDATE SET
         busca_id = COALESCE(meta_ads.busca_id, EXCLUDED.busca_id),
         pagina_id = COALESCE(meta_ads.pagina_id, EXCLUDED.pagina_id),
         page_name = CASE
           WHEN meta_ads.page_name = '' THEN EXCLUDED.page_name
           ELSE meta_ads.page_name
         END,
         texto = EXCLUDED.texto,
         titulo = EXCLUDED.titulo,
         cta_text = EXCLUDED.cta_text,
         link_url = COALESCE(EXCLUDED.link_url, meta_ads.link_url),
         imagem_url = COALESCE(EXCLUDED.imagem_url, meta_ads.imagem_url),
         video_url = COALESCE(EXCLUDED.video_url, meta_ads.video_url),
         fim_em = COALESCE(EXCLUDED.fim_em, meta_ads.fim_em)
       RETURNING id, (xmax = 0) AS novo
     )
     SELECT upsert.id, upsert.novo, existente.texto AS texto_anterior
     FROM upsert
     LEFT JOIN existente ON existente.id = upsert.id`,
    [
      input.buscaId,
      input.paginaId,
      input.adArchiveId,
      input.pageId,
      input.pageName,
      input.url,
      input.texto,
      input.titulo,
      input.ctaText,
      input.linkUrl,
      input.imagemUrl,
      input.videoUrl,
      input.inicioEm?.toISOString() ?? null,
      input.fimEm?.toISOString() ?? null,
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

export async function obterMetaAdPorId(id: number): Promise<MetaAd | null> {
  if (!isDatabaseConfigured()) return null;

  const result = await getPool().query<MetaAd>(
    `SELECT
       ads.*,
       b.termo AS busca_termo,
       p.slug AS pagina_slug
     FROM meta_ads ads
     LEFT JOIN meta_ads_buscas b ON b.id = ads.busca_id
     LEFT JOIN meta_ads_paginas p ON p.id = ads.pagina_id
     WHERE ads.id = $1`,
    [id],
  );

  return result.rows[0] ? mapAd(result.rows[0]) : null;
}

export async function buscarMetaAds(params: {
  termo?: string;
  limite?: number;
  offset?: number;
}): Promise<MetaAd[]> {
  if (!isDatabaseConfigured()) return [];

  const limite = Math.min(Math.max(params.limite ?? 20, 1), 100);
  const offset = Math.max(params.offset ?? 0, 0);
  const busca = termoSql(params.termo);

  const result = await getPool().query<MetaAd>(
    `SELECT
       ads.*,
       b.termo AS busca_termo,
       p.slug AS pagina_slug
     FROM meta_ads ads
     LEFT JOIN meta_ads_buscas b ON b.id = ads.busca_id
     LEFT JOIN meta_ads_paginas p ON p.id = ads.pagina_id
     WHERE (
       $1::text IS NULL
       OR ads.texto ILIKE $1
       OR ads.titulo ILIKE $1
       OR ads.page_name ILIKE $1
       OR b.termo ILIKE $1
       OR p.slug ILIKE $1
       OR translate(lower(ads.texto), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $2
     )
     ORDER BY COALESCE(ads.inicio_em, ads.criado_em) DESC
     LIMIT $3 OFFSET $4`,
    [busca.ilike, busca.normalizado, limite, offset],
  );

  return result.rows.map(mapAd);
}

export async function contarMetaAds(params: { termo?: string }): Promise<number> {
  if (!isDatabaseConfigured()) return 0;

  const busca = termoSql(params.termo);
  const result = await getPool().query<{ total: string }>(
    `SELECT COUNT(*)::text AS total
     FROM meta_ads ads
     LEFT JOIN meta_ads_buscas b ON b.id = ads.busca_id
     LEFT JOIN meta_ads_paginas p ON p.id = ads.pagina_id
     WHERE (
       $1::text IS NULL
       OR ads.texto ILIKE $1
       OR ads.titulo ILIKE $1
       OR ads.page_name ILIKE $1
       OR b.termo ILIKE $1
       OR p.slug ILIKE $1
       OR translate(lower(ads.texto), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $2
     )`,
    [busca.ilike, busca.normalizado],
  );

  return Number(result.rows[0]?.total ?? 0);
}

export async function listarMetaAdsParaReescanear(
  limite: number,
  offset = 0,
): Promise<Array<{ id: number }>> {
  if (!isDatabaseConfigured()) return [];

  const result = await getPool().query<{ id: number }>(
    `SELECT id
     FROM meta_ads
     WHERE texto <> '' OR titulo <> ''
     ORDER BY COALESCE(inicio_em, criado_em) DESC
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
  anuncios_total?: string | number;
  deteccoes_total?: string | number;
}): MetaAdsBusca {
  return {
    id: row.id,
    termo: row.termo,
    ativo: Boolean(row.ativo),
    ultima_verificacao_em: row.ultima_verificacao_em,
    ultimo_erro: row.ultimo_erro,
    criado_em: row.criado_em,
    anuncios_total: row.anuncios_total != null ? Number(row.anuncios_total) : undefined,
    deteccoes_total: row.deteccoes_total != null ? Number(row.deteccoes_total) : undefined,
  };
}

function mapPagina(row: {
  id: number;
  slug: string;
  titulo: string;
  url_entrada: string;
  ativo: boolean;
  ultima_verificacao_em: string | null;
  ultimo_erro: string | null;
  criado_em: string;
  anuncios_total?: string | number;
}): MetaAdsPagina {
  return {
    id: row.id,
    slug: row.slug,
    titulo: row.titulo,
    url_entrada: row.url_entrada,
    ativo: Boolean(row.ativo),
    ultima_verificacao_em: row.ultima_verificacao_em,
    ultimo_erro: row.ultimo_erro,
    criado_em: row.criado_em,
    anuncios_total: row.anuncios_total != null ? Number(row.anuncios_total) : undefined,
  };
}

function mapAd(row: MetaAd): MetaAd {
  return { ...row };
}
