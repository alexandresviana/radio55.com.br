import { getPool, isDatabaseConfigured } from "@/lib/db";
import { listarInstagramBuscasAtivas } from "@/lib/instagram-db";
import { listarMetaAdsBuscasAtivas } from "@/lib/meta-ads-db";
import { listarPalavrasChaveAtivas } from "@/lib/palavras-chave-db";
import { normalizeText } from "@/lib/text-normalize";
import { listarXBuscasAtivas } from "@/lib/x-db";

export type FontePanorama = "radio" | "youtube" | "instagram" | "x" | "meta_ads";
export type JanelaPanorama = "24h" | "7d" | "30d";

export interface ItemPanorama {
  chave: string;
  fonte: FontePanorama;
  id: number;
  termo: string;
  contexto: string;
  detectado_em: string;
  titulo: string;
  subtitulo: string;
  url: string | null;
  trecho_audio: string | null;
  detalhe: string | null;
}

export interface ContagensPanorama {
  total: number;
  radio: number;
  youtube: number;
  instagram: number;
  x: number;
  meta_ads: number;
}

function janelaParaDesde(janela: JanelaPanorama): Date {
  const agora = Date.now();
  const horas = janela === "24h" ? 24 : janela === "7d" ? 24 * 7 : 24 * 30;
  return new Date(agora - horas * 60 * 60 * 1000);
}

function termoSql(termo?: string): { ilike: string | null; normalizado: string | null } {
  const trimmed = termo?.trim();
  if (!trimmed) return { ilike: null, normalizado: null };
  return {
    ilike: `%${trimmed}%`,
    normalizado: `%${normalizeText(trimmed)}%`,
  };
}

export async function listarAssuntosPanorama(): Promise<string[]> {
  if (!isDatabaseConfigured()) return [];

  const [palavras, buscasIg, buscasX, buscasMeta] = await Promise.all([
    listarPalavrasChaveAtivas(),
    listarInstagramBuscasAtivas(),
    listarXBuscasAtivas(),
    listarMetaAdsBuscasAtivas(),
  ]);

  const vistos = new Set<string>();
  const assuntos: string[] = [];

  for (const item of [
    ...palavras.map((p) => p.termo),
    ...buscasIg.map((b) => b.termo),
    ...buscasX.map((b) => b.termo),
    ...buscasMeta.map((b) => b.termo),
  ]) {
    const chave = normalizeText(item);
    if (!chave || vistos.has(chave)) continue;
    vistos.add(chave);
    assuntos.push(item);
  }

  return assuntos.sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export async function contarPanorama(params: {
  termo?: string;
  janela?: JanelaPanorama;
}): Promise<ContagensPanorama> {
  if (!isDatabaseConfigured()) {
    return { total: 0, radio: 0, youtube: 0, instagram: 0, x: 0, meta_ads: 0 };
  }

  const desde = janelaParaDesde(params.janela ?? "24h").toISOString();
  const busca = termoSql(params.termo);

  const result = await getPool().query<{
    radio: string;
    youtube: string;
    instagram: string;
    x: string;
    meta_ads: string;
  }>(
    `SELECT
       (
         SELECT COUNT(*)::text
         FROM palavra_deteccoes d
         JOIN gravacao_arquivos g ON g.id = d.gravacao_id
         WHERE g.removido_em IS NULL
           AND d.detectado_em >= $1::timestamptz
           AND (
             $2::text IS NULL
             OR d.termo ILIKE $2
             OR d.contexto ILIKE $2
             OR translate(lower(d.termo), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $3
             OR translate(lower(d.contexto), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $3
           )
       ) AS radio,
       (
         SELECT COUNT(*)::text
         FROM youtube_palavra_deteccoes d
         JOIN youtube_videos v ON v.id = d.video_db_id
         WHERE d.detectado_em >= $1::timestamptz
           AND (
             $2::text IS NULL
             OR d.termo ILIKE $2
             OR d.contexto ILIKE $2
             OR v.titulo ILIKE $2
             OR translate(lower(d.termo), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $3
             OR translate(lower(d.contexto), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $3
           )
       ) AS youtube,
       (
         SELECT COUNT(*)::text
         FROM instagram_palavra_deteccoes d
         WHERE d.detectado_em >= $1::timestamptz
           AND (
             $2::text IS NULL
             OR d.termo ILIKE $2
             OR d.contexto ILIKE $2
             OR translate(lower(d.termo), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $3
             OR translate(lower(d.contexto), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $3
           )
       ) AS instagram,
       (
         SELECT COUNT(*)::text
         FROM x_palavra_deteccoes d
         WHERE d.detectado_em >= $1::timestamptz
           AND (
             $2::text IS NULL
             OR d.termo ILIKE $2
             OR d.contexto ILIKE $2
             OR translate(lower(d.termo), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $3
             OR translate(lower(d.contexto), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $3
           )
       ) AS x,
       (
         SELECT COUNT(*)::text
         FROM meta_ads_palavra_deteccoes d
         WHERE d.detectado_em >= $1::timestamptz
           AND (
             $2::text IS NULL
             OR d.termo ILIKE $2
             OR d.contexto ILIKE $2
             OR translate(lower(d.termo), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $3
             OR translate(lower(d.contexto), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $3
           )
       ) AS meta_ads`,
    [desde, busca.ilike, busca.normalizado],
  );

  const row = result.rows[0];
  const radio = Number(row?.radio ?? 0);
  const youtube = Number(row?.youtube ?? 0);
  const instagram = Number(row?.instagram ?? 0);
  const x = Number(row?.x ?? 0);
  const meta_ads = Number(row?.meta_ads ?? 0);

  return {
    total: radio + youtube + instagram + x + meta_ads,
    radio,
    youtube,
    instagram,
    x,
    meta_ads,
  };
}

export async function buscarPanorama(params: {
  termo?: string;
  janela?: JanelaPanorama;
  fonte?: FontePanorama | "todas";
  limite?: number;
  offset?: number;
}): Promise<ItemPanorama[]> {
  if (!isDatabaseConfigured()) return [];

  const limite = Math.min(Math.max(params.limite ?? 30, 1), 100);
  const offset = Math.max(params.offset ?? 0, 0);
  const desde = janelaParaDesde(params.janela ?? "24h").toISOString();
  const busca = termoSql(params.termo);
  const fonte = params.fonte ?? "todas";

  const partes: string[] = [];

  if (fonte === "todas" || fonte === "radio") {
    partes.push(`
      SELECT
        'radio'::text AS fonte,
        d.id,
        d.termo,
        d.contexto,
        d.detectado_em,
        (g.radio_nome || ' · ' || g.municipio) AS titulo,
        CASE WHEN g.em_gravacao THEN 'Ao vivo' ELSE 'Gravação' END AS subtitulo,
        NULL::text AS url,
        ('/api/deteccoes/' || d.id::text || '/trecho') AS trecho_audio,
        (FLOOR(d.inicio_segundos)::text || 's') AS detalhe
      FROM palavra_deteccoes d
      JOIN gravacao_arquivos g ON g.id = d.gravacao_id
      WHERE g.removido_em IS NULL
        AND d.detectado_em >= $1::timestamptz
        AND (
          $2::text IS NULL
          OR d.termo ILIKE $2
          OR d.contexto ILIKE $2
          OR translate(lower(d.termo), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $3
          OR translate(lower(d.contexto), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $3
        )
    `);
  }

  if (fonte === "todas" || fonte === "youtube") {
    partes.push(`
      SELECT
        'youtube'::text AS fonte,
        d.id,
        d.termo,
        d.contexto,
        d.detectado_em,
        c.titulo AS titulo,
        v.titulo AS subtitulo,
        ('https://www.youtube.com/watch?v=' || v.video_id || '&t=' || FLOOR(d.inicio_segundos)::text || 's') AS url,
        NULL::text AS trecho_audio,
        (FLOOR(d.inicio_segundos)::text || 's') AS detalhe
      FROM youtube_palavra_deteccoes d
      JOIN youtube_videos v ON v.id = d.video_db_id
      JOIN youtube_canais c ON c.id = v.canal_id
      WHERE d.detectado_em >= $1::timestamptz
        AND (
          $2::text IS NULL
          OR d.termo ILIKE $2
          OR d.contexto ILIKE $2
          OR v.titulo ILIKE $2
          OR translate(lower(d.termo), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $3
          OR translate(lower(d.contexto), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $3
        )
    `);
  }

  if (fonte === "todas" || fonte === "instagram") {
    partes.push(`
      SELECT
        'instagram'::text AS fonte,
        d.id,
        d.termo,
        d.contexto,
        d.detectado_em,
        ('@' || COALESCE(NULLIF(posts.owner_username, ''), p.username, 'instagram')) AS titulo,
        CASE
          WHEN d.comentario_db_id IS NOT NULL
            THEN ('Comentário · @' || COALESCE(c.autor_username, '?'))
          WHEN b.termo IS NOT NULL THEN ('Hashtag #' || b.termo)
          ELSE 'Publicação'
        END AS subtitulo,
        posts.url AS url,
        NULL::text AS trecho_audio,
        NULL::text AS detalhe
      FROM instagram_palavra_deteccoes d
      JOIN instagram_posts posts ON posts.id = d.post_db_id
      LEFT JOIN instagram_perfis p ON p.id = posts.perfil_id
      LEFT JOIN instagram_buscas b ON b.id = posts.busca_id
      LEFT JOIN instagram_comentarios c ON c.id = d.comentario_db_id
      WHERE d.detectado_em >= $1::timestamptz
        AND (
          $2::text IS NULL
          OR d.termo ILIKE $2
          OR d.contexto ILIKE $2
          OR translate(lower(d.termo), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $3
          OR translate(lower(d.contexto), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $3
        )
    `);
  }

  if (fonte === "todas" || fonte === "x") {
    partes.push(`
      SELECT
        'x'::text AS fonte,
        d.id,
        d.termo,
        d.contexto,
        d.detectado_em,
        ('@' || COALESCE(NULLIF(posts.autor_username, ''), 'x')) AS titulo,
        CASE
          WHEN b.termo IS NOT NULL THEN ('Busca · ' || b.termo)
          ELSE 'Post'
        END AS subtitulo,
        posts.url AS url,
        NULL::text AS trecho_audio,
        NULL::text AS detalhe
      FROM x_palavra_deteccoes d
      JOIN x_posts posts ON posts.id = d.post_db_id
      LEFT JOIN x_buscas b ON b.id = posts.busca_id
      WHERE d.detectado_em >= $1::timestamptz
        AND (
          $2::text IS NULL
          OR d.termo ILIKE $2
          OR d.contexto ILIKE $2
          OR translate(lower(d.termo), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $3
          OR translate(lower(d.contexto), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $3
        )
    `);
  }

  if (fonte === "todas" || fonte === "meta_ads") {
    partes.push(`
      SELECT
        'meta_ads'::text AS fonte,
        d.id,
        d.termo,
        d.contexto,
        d.detectado_em,
        COALESCE(NULLIF(ads.page_name, ''), 'Anunciante') AS titulo,
        CASE
          WHEN b.termo IS NOT NULL THEN ('Anúncio · ' || b.termo)
          WHEN p.slug IS NOT NULL THEN ('Página · ' || p.slug)
          ELSE 'Anúncio'
        END AS subtitulo,
        ads.url AS url,
        NULL::text AS trecho_audio,
        NULL::text AS detalhe
      FROM meta_ads_palavra_deteccoes d
      JOIN meta_ads ads ON ads.id = d.ad_db_id
      LEFT JOIN meta_ads_buscas b ON b.id = ads.busca_id
      LEFT JOIN meta_ads_paginas p ON p.id = ads.pagina_id
      WHERE d.detectado_em >= $1::timestamptz
        AND (
          $2::text IS NULL
          OR d.termo ILIKE $2
          OR d.contexto ILIKE $2
          OR translate(lower(d.termo), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $3
          OR translate(lower(d.contexto), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $3
        )
    `);
  }

  if (partes.length === 0) return [];

  const result = await getPool().query<{
    fonte: FontePanorama;
    id: number;
    termo: string;
    contexto: string;
    detectado_em: string;
    titulo: string;
    subtitulo: string;
    url: string | null;
    trecho_audio: string | null;
    detalhe: string | null;
  }>(
    `SELECT * FROM (
       ${partes.join(" UNION ALL ")}
     ) AS panorama
     ORDER BY detectado_em DESC
     LIMIT $4 OFFSET $5`,
    [desde, busca.ilike, busca.normalizado, limite, offset],
  );

  return result.rows.map((row) => ({
    chave: `${row.fonte}-${row.id}`,
    fonte: row.fonte,
    id: row.id,
    termo: row.termo,
    contexto: row.contexto,
    detectado_em: new Date(row.detectado_em).toISOString(),
    titulo: row.titulo,
    subtitulo: row.subtitulo,
    url: row.url,
    trecho_audio: row.trecho_audio,
    detalhe: row.detalhe,
  }));
}
