import { getPool, isDatabaseConfigured } from "@/lib/db";
import { normalizeText } from "@/lib/text-normalize";

export interface InstagramPerfil {
  id: number;
  username: string;
  titulo: string;
  url_entrada: string;
  ativo: boolean;
  ultima_verificacao_em: string | null;
  ultimo_erro: string | null;
  criado_em: string;
  posts_total?: number;
  deteccoes_total?: number;
}

export interface InstagramBusca {
  id: number;
  termo: string;
  ativo: boolean;
  ultima_verificacao_em: string | null;
  ultimo_erro: string | null;
  criado_em: string;
  posts_total?: number;
  deteccoes_total?: number;
}

export interface InstagramPost {
  id: number;
  perfil_id: number | null;
  busca_id: number | null;
  owner_username: string;
  post_id: string;
  short_code: string;
  url: string;
  tipo: string;
  legenda: string;
  publicado_em: string | null;
  video_url: string | null;
  imagem_url: string | null;
  curtidas: number | null;
  comentarios: number | null;
  criado_em: string;
  perfil_username?: string;
  perfil_titulo?: string;
  busca_termo?: string;
  comentarios_salvos?: number;
}

export async function listarInstagramPerfis(): Promise<InstagramPerfil[]> {
  if (!isDatabaseConfigured()) return [];

  const result = await getPool().query<
    InstagramPerfil & { posts_total: string; deteccoes_total: string }
  >(
    `SELECT
       p.id,
       p.username,
       p.titulo,
       p.url_entrada,
       p.ativo,
       p.ultima_verificacao_em,
       p.ultimo_erro,
       p.criado_em,
       COUNT(DISTINCT posts.id)::text AS posts_total,
       COUNT(d.id)::text AS deteccoes_total
     FROM instagram_perfis p
     LEFT JOIN instagram_posts posts ON posts.perfil_id = p.id
     LEFT JOIN instagram_palavra_deteccoes d ON d.post_db_id = posts.id
     GROUP BY p.id
     ORDER BY p.username ASC`,
  );

  return result.rows.map(mapPerfil);
}

export async function listarInstagramPerfisAtivos(): Promise<InstagramPerfil[]> {
  if (!isDatabaseConfigured()) return [];

  const result = await getPool().query<InstagramPerfil>(
    `SELECT id, username, titulo, url_entrada, ativo, ultima_verificacao_em, ultimo_erro, criado_em
     FROM instagram_perfis
     WHERE ativo = TRUE
     ORDER BY id ASC`,
  );

  return result.rows.map(mapPerfil);
}

export async function criarInstagramPerfil(input: {
  username: string;
  titulo: string;
  urlEntrada: string;
}): Promise<InstagramPerfil> {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL não configurado");
  }

  const result = await getPool().query<InstagramPerfil>(
    `INSERT INTO instagram_perfis (username, titulo, url_entrada, ativo)
     VALUES ($1, $2, $3, TRUE)
     RETURNING id, username, titulo, url_entrada, ativo, ultima_verificacao_em, ultimo_erro, criado_em`,
    [input.username, input.titulo, input.urlEntrada],
  );

  const row = result.rows[0];
  if (!row) throw new Error("Falha ao cadastrar perfil");

  return mapPerfil(row);
}

export async function atualizarInstagramPerfil(
  id: number,
  patch: { ativo?: boolean; titulo?: string },
): Promise<InstagramPerfil | null> {
  if (!isDatabaseConfigured()) return null;

  const result = await getPool().query<InstagramPerfil>(
    `UPDATE instagram_perfis
     SET
       ativo = COALESCE($2, ativo),
       titulo = COALESCE($3, titulo)
     WHERE id = $1
     RETURNING id, username, titulo, url_entrada, ativo, ultima_verificacao_em, ultimo_erro, criado_em`,
    [id, patch.ativo ?? null, patch.titulo ?? null],
  );

  const row = result.rows[0];
  return row ? mapPerfil(row) : null;
}

export async function removerInstagramPerfil(id: number): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;

  const result = await getPool().query(`DELETE FROM instagram_perfis WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function marcarPerfilVerificado(id: number, erro?: string | null): Promise<void> {
  if (!isDatabaseConfigured()) return;

  await getPool().query(
    `UPDATE instagram_perfis SET ultima_verificacao_em = NOW(), ultimo_erro = $2 WHERE id = $1`,
    [id, erro ?? null],
  );
}

export async function listarInstagramBuscas(): Promise<InstagramBusca[]> {
  if (!isDatabaseConfigured()) return [];

  const result = await getPool().query<
    InstagramBusca & { posts_total: string; deteccoes_total: string }
  >(
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
         FROM instagram_palavra_deteccoes d
         WHERE lower(d.termo) IN (lower(b.termo), lower('#' || b.termo))
       ) AS deteccoes_total
     FROM instagram_buscas b
     LEFT JOIN instagram_posts posts ON posts.busca_id = b.id
     GROUP BY b.id
     ORDER BY b.termo ASC`,
  );

  return result.rows.map(mapBusca);
}

export async function listarInstagramBuscasAtivas(): Promise<InstagramBusca[]> {
  if (!isDatabaseConfigured()) return [];

  const result = await getPool().query<InstagramBusca>(
    `SELECT id, termo, ativo, ultima_verificacao_em, ultimo_erro, criado_em
     FROM instagram_buscas
     WHERE ativo = TRUE
     ORDER BY id ASC`,
  );

  return result.rows.map(mapBusca);
}

export async function criarInstagramBusca(termo: string): Promise<InstagramBusca> {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL não configurado");
  }

  const result = await getPool().query<InstagramBusca>(
    `INSERT INTO instagram_buscas (termo, ativo)
     VALUES ($1, TRUE)
     RETURNING id, termo, ativo, ultima_verificacao_em, ultimo_erro, criado_em`,
    [termo],
  );

  const row = result.rows[0];
  if (!row) throw new Error("Falha ao cadastrar termo");

  return mapBusca(row);
}

export async function atualizarInstagramBusca(
  id: number,
  patch: { ativo?: boolean },
): Promise<InstagramBusca | null> {
  if (!isDatabaseConfigured()) return null;

  const result = await getPool().query<InstagramBusca>(
    `UPDATE instagram_buscas
     SET ativo = COALESCE($2, ativo)
     WHERE id = $1
     RETURNING id, termo, ativo, ultima_verificacao_em, ultimo_erro, criado_em`,
    [id, patch.ativo ?? null],
  );

  const row = result.rows[0];
  return row ? mapBusca(row) : null;
}

export async function removerInstagramBusca(id: number): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;

  const result = await getPool().query(`DELETE FROM instagram_buscas WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function marcarBuscaVerificada(id: number, erro?: string | null): Promise<void> {
  if (!isDatabaseConfigured()) return;

  await getPool().query(
    `UPDATE instagram_buscas SET ultima_verificacao_em = NOW(), ultimo_erro = $2 WHERE id = $1`,
    [id, erro ?? null],
  );
}

export async function registrarPostInstagram(input: {
  perfilId: number | null;
  buscaId: number | null;
  ownerUsername: string;
  postId: string;
  shortCode: string;
  url: string;
  tipo: string;
  legenda: string;
  publicadoEm: Date | null;
  videoUrl: string | null;
  imagemUrl: string | null;
  curtidas: number | null;
  comentarios: number | null;
}): Promise<{ id: number; novo: boolean; legendaMudou: boolean } | null> {
  if (!isDatabaseConfigured()) return null;

  // Só grava FKs que ainda existem (evita corrida se o perfil/termo foi
  // removido enquanto a coleta externa ainda rodava).
  const result = await getPool().query<{
    id: number;
    novo: boolean;
    legenda_anterior: string | null;
  }>(
    `WITH existente AS (
       SELECT id, legenda
       FROM instagram_posts
       WHERE post_id = $4
     ),
     fonte AS (
       SELECT
         (SELECT id FROM instagram_perfis WHERE id = $1) AS perfil_id,
         (SELECT id FROM instagram_buscas WHERE id = $2) AS busca_id,
         $3::text AS owner_username,
         $4::text AS post_id,
         $5::text AS short_code,
         $6::text AS url,
         $7::text AS tipo,
         $8::text AS legenda,
         $9::timestamptz AS publicado_em,
         $10::text AS video_url,
         $11::text AS imagem_url,
         $12::int AS curtidas,
         $13::int AS comentarios
     ),
     upsert AS (
       INSERT INTO instagram_posts (
         perfil_id, busca_id, owner_username, post_id, short_code, url, tipo, legenda,
         publicado_em, video_url, imagem_url, curtidas, comentarios
       )
       SELECT
         perfil_id, busca_id, owner_username, post_id, short_code, url, tipo, legenda,
         publicado_em, video_url, imagem_url, curtidas, comentarios
       FROM fonte
       ON CONFLICT (post_id) DO UPDATE SET
         perfil_id = COALESCE(
           (SELECT id FROM instagram_perfis WHERE id = instagram_posts.perfil_id),
           EXCLUDED.perfil_id
         ),
         busca_id = COALESCE(
           (SELECT id FROM instagram_buscas WHERE id = instagram_posts.busca_id),
           EXCLUDED.busca_id
         ),
         owner_username = CASE
           WHEN instagram_posts.owner_username = '' THEN EXCLUDED.owner_username
           ELSE instagram_posts.owner_username
         END,
         legenda = EXCLUDED.legenda,
         curtidas = COALESCE(EXCLUDED.curtidas, instagram_posts.curtidas),
         comentarios = COALESCE(EXCLUDED.comentarios, instagram_posts.comentarios),
         video_url = COALESCE(EXCLUDED.video_url, instagram_posts.video_url),
         imagem_url = COALESCE(EXCLUDED.imagem_url, instagram_posts.imagem_url)
       RETURNING id, (xmax = 0) AS novo
     )
     SELECT
       upsert.id,
       upsert.novo,
       existente.legenda AS legenda_anterior
     FROM upsert
     LEFT JOIN existente ON existente.id = upsert.id`,
    [
      input.perfilId,
      input.buscaId,
      input.ownerUsername,
      input.postId,
      input.shortCode,
      input.url,
      input.tipo,
      input.legenda,
      input.publicadoEm ? input.publicadoEm.toISOString() : null,
      input.videoUrl,
      input.imagemUrl,
      input.curtidas,
      input.comentarios,
    ],
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    id: row.id,
    novo: Boolean(row.novo),
    legendaMudou: !row.novo && (row.legenda_anterior ?? "") !== input.legenda,
  };
}

function termoBuscaSql(termo?: string): { ilike: string | null; normalizado: string | null } {
  const trimmed = termo?.trim();
  if (!trimmed) return { ilike: null, normalizado: null };

  return {
    ilike: `%${trimmed}%`,
    normalizado: `%${normalizeText(trimmed)}%`,
  };
}

export async function contarInstagramPosts(params: {
  perfilId?: number;
  buscaId?: number;
  termo?: string;
}): Promise<number> {
  if (!isDatabaseConfigured()) return 0;

  const busca = termoBuscaSql(params.termo);

  const result = await getPool().query<{ total: string }>(
    `SELECT COUNT(*)::text AS total
     FROM instagram_posts posts
     WHERE ($1::int IS NULL OR posts.perfil_id = $1)
       AND ($4::int IS NULL OR posts.busca_id = $4)
       AND (
         $2::text IS NULL
         OR posts.legenda ILIKE $2
         OR translate(lower(posts.legenda), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $3
       )`,
    [params.perfilId ?? null, busca.ilike, busca.normalizado, params.buscaId ?? null],
  );

  return Number(result.rows[0]?.total ?? 0);
}

export async function buscarInstagramPosts(params: {
  perfilId?: number;
  buscaId?: number;
  termo?: string;
  limite?: number;
  offset?: number;
}): Promise<InstagramPost[]> {
  if (!isDatabaseConfigured()) return [];

  const limite = Math.min(Math.max(params.limite ?? 20, 1), 200);
  const offset = Math.max(params.offset ?? 0, 0);
  const busca = termoBuscaSql(params.termo);

  const result = await getPool().query<InstagramPost>(
    `SELECT
       posts.id,
       posts.perfil_id,
       posts.busca_id,
       posts.owner_username,
       posts.post_id,
       posts.short_code,
       posts.url,
       posts.tipo,
       posts.legenda,
       posts.publicado_em,
       posts.video_url,
       posts.imagem_url,
       posts.curtidas,
       posts.comentarios,
       posts.criado_em,
       COALESCE(NULLIF(posts.owner_username, ''), p.username) AS perfil_username,
       p.titulo AS perfil_titulo,
       b.termo AS busca_termo,
       (SELECT COUNT(*)::text FROM instagram_comentarios c WHERE c.post_db_id = posts.id) AS comentarios_salvos
     FROM instagram_posts posts
     LEFT JOIN instagram_perfis p ON p.id = posts.perfil_id
     LEFT JOIN instagram_buscas b ON b.id = posts.busca_id
     WHERE ($1::int IS NULL OR posts.perfil_id = $1)
       AND ($6::int IS NULL OR posts.busca_id = $6)
       AND (
         $2::text IS NULL
         OR posts.legenda ILIKE $2
         OR translate(lower(posts.legenda), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $3
       )
     ORDER BY posts.publicado_em DESC NULLS LAST, posts.id DESC
     LIMIT $4 OFFSET $5`,
    [
      params.perfilId ?? null,
      busca.ilike,
      busca.normalizado,
      limite,
      offset,
      params.buscaId ?? null,
    ],
  );

  return result.rows.map(mapPost);
}

export async function obterInstagramPostPorId(id: number): Promise<InstagramPost | null> {
  if (!isDatabaseConfigured()) return null;

  const result = await getPool().query<InstagramPost>(
    `SELECT
       posts.id,
       posts.perfil_id,
       posts.busca_id,
       posts.owner_username,
       posts.post_id,
       posts.short_code,
       posts.url,
       posts.tipo,
       posts.legenda,
       posts.publicado_em,
       posts.video_url,
       posts.imagem_url,
       posts.curtidas,
       posts.comentarios,
       posts.criado_em,
       COALESCE(NULLIF(posts.owner_username, ''), p.username) AS perfil_username,
       p.titulo AS perfil_titulo,
       b.termo AS busca_termo
     FROM instagram_posts posts
     LEFT JOIN instagram_perfis p ON p.id = posts.perfil_id
     LEFT JOIN instagram_buscas b ON b.id = posts.busca_id
     WHERE posts.id = $1`,
    [id],
  );

  const row = result.rows[0];
  return row ? mapPost(row) : null;
}

function mapPerfil(
  row: Omit<InstagramPerfil, "posts_total" | "deteccoes_total"> & {
    posts_total?: string | number;
    deteccoes_total?: string | number;
  },
): InstagramPerfil {
  return {
    ...row,
    ativo: Boolean(row.ativo),
    ultima_verificacao_em: row.ultima_verificacao_em
      ? new Date(row.ultima_verificacao_em).toISOString()
      : null,
    criado_em: new Date(row.criado_em).toISOString(),
    posts_total:
      row.posts_total !== undefined && row.posts_total !== null
        ? Number(row.posts_total)
        : undefined,
    deteccoes_total:
      row.deteccoes_total !== undefined && row.deteccoes_total !== null
        ? Number(row.deteccoes_total)
        : undefined,
  };
}

function mapBusca(
  row: Omit<InstagramBusca, "posts_total" | "deteccoes_total"> & {
    posts_total?: string | number;
    deteccoes_total?: string | number;
  },
): InstagramBusca {
  return {
    ...row,
    ativo: Boolean(row.ativo),
    ultima_verificacao_em: row.ultima_verificacao_em
      ? new Date(row.ultima_verificacao_em).toISOString()
      : null,
    criado_em: new Date(row.criado_em).toISOString(),
    posts_total:
      row.posts_total !== undefined && row.posts_total !== null
        ? Number(row.posts_total)
        : undefined,
    deteccoes_total:
      row.deteccoes_total !== undefined && row.deteccoes_total !== null
        ? Number(row.deteccoes_total)
        : undefined,
  };
}

function mapPost(row: InstagramPost): InstagramPost {
  return {
    ...row,
    publicado_em: row.publicado_em ? new Date(row.publicado_em).toISOString() : null,
    criado_em: new Date(row.criado_em).toISOString(),
    curtidas: row.curtidas !== null ? Number(row.curtidas) : null,
    comentarios: row.comentarios !== null ? Number(row.comentarios) : null,
    comentarios_salvos:
      row.comentarios_salvos !== undefined && row.comentarios_salvos !== null
        ? Number(row.comentarios_salvos)
        : undefined,
  };
}
