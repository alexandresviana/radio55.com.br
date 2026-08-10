import { getPool, isDatabaseConfigured } from "@/lib/db";
import { readEmissoras } from "@/lib/emissoras";
import { listarInstagramBuscasAtivas, listarInstagramPerfisAtivos } from "@/lib/instagram-db";
import {
  listarMetaAdsBuscasAtivas,
  listarMetaAdsPaginasAtivas,
} from "@/lib/meta-ads-db";
import { listarPalavrasChaveAtivas } from "@/lib/palavras-chave-db";
import { normalizeText } from "@/lib/text-normalize";
import { listarXBuscasAtivas } from "@/lib/x-db";
import { listarYoutubeCanaisAtivos } from "@/lib/youtube-db";

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

export interface PontoEvolucaoPanorama {
  /** Início do bucket (hora ou dia, ISO). */
  hora: string;
  radio: number;
  youtube: number;
  instagram: number;
  x: number;
  meta_ads: number;
  total: number;
}

/** Contagem de menções por veículo no período (hora em 24h; dia em 7d/30d). */
export async function buscarEvolucaoPanorama(params: {
  termo?: string;
  janela?: JanelaPanorama;
}): Promise<PontoEvolucaoPanorama[]> {
  const janela = params.janela ?? "24h";
  const trunc = janela === "24h" ? "hour" : "day";
  const buckets = montarBucketsEvolucao(janela);

  if (!isDatabaseConfigured()) {
    return buckets.map((hora) => pontoVazio(hora.toISOString()));
  }

  const desde = buckets[0]!.toISOString();
  const busca = termoSql(params.termo);

  // trunc é whitelist ('hour' | 'day') — seguro embutir no SQL.
  const result = await getPool().query<{
    hora: Date;
    fonte: FontePanorama;
    total: string;
  }>(
    `SELECT hora, fonte, COUNT(*)::text AS total
     FROM (
       SELECT date_trunc('${trunc}', d.detectado_em) AS hora, 'radio'::text AS fonte
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
       UNION ALL
       SELECT date_trunc('${trunc}', d.detectado_em), 'youtube'
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
       UNION ALL
       SELECT date_trunc('${trunc}', d.detectado_em), 'instagram'
       FROM instagram_palavra_deteccoes d
       WHERE d.detectado_em >= $1::timestamptz
         AND (
           $2::text IS NULL
           OR d.termo ILIKE $2
           OR d.contexto ILIKE $2
           OR translate(lower(d.termo), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $3
           OR translate(lower(d.contexto), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $3
         )
       UNION ALL
       SELECT date_trunc('${trunc}', d.detectado_em), 'x'
       FROM x_palavra_deteccoes d
       WHERE d.detectado_em >= $1::timestamptz
         AND (
           $2::text IS NULL
           OR d.termo ILIKE $2
           OR d.contexto ILIKE $2
           OR translate(lower(d.termo), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $3
           OR translate(lower(d.contexto), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $3
         )
       UNION ALL
       SELECT date_trunc('${trunc}', d.detectado_em), 'meta_ads'
       FROM meta_ads_palavra_deteccoes d
       WHERE d.detectado_em >= $1::timestamptz
         AND (
           $2::text IS NULL
           OR d.termo ILIKE $2
           OR d.contexto ILIKE $2
           OR translate(lower(d.termo), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $3
           OR translate(lower(d.contexto), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $3
         )
     ) AS eventos
     GROUP BY hora, fonte
     ORDER BY hora ASC`,
    [desde, busca.ilike, busca.normalizado],
  );

  const porBucket = new Map<string, PontoEvolucaoPanorama>();
  for (const bucket of buckets) {
    porBucket.set(bucket.toISOString(), pontoVazio(bucket.toISOString()));
  }

  for (const row of result.rows) {
    const chave = new Date(row.hora).toISOString();
    const ponto = porBucket.get(chave);
    if (!ponto) continue;
    const n = Number(row.total ?? 0);
    if (row.fonte === "radio") ponto.radio = n;
    else if (row.fonte === "youtube") ponto.youtube = n;
    else if (row.fonte === "instagram") ponto.instagram = n;
    else if (row.fonte === "x") ponto.x = n;
    else if (row.fonte === "meta_ads") ponto.meta_ads = n;
    ponto.total = ponto.radio + ponto.youtube + ponto.instagram + ponto.x + ponto.meta_ads;
  }

  return [...porBucket.values()];
}

/** @deprecated use buscarEvolucaoPanorama */
export async function buscarEvolucaoPanorama24h(params: {
  termo?: string;
}): Promise<PontoEvolucaoPanorama[]> {
  return buscarEvolucaoPanorama({ ...params, janela: "24h" });
}

export interface SerieEvolucaoFonte {
  id: string;
  label: string;
}

export interface PontoEvolucaoFontes {
  hora: string;
  /** Contagem por id de série. */
  valores: Record<string, number>;
  total: number;
}

const LIMITE_SERIES_FONTE = 12;

/**
 * Evolução temporal das fontes monitoradas de um veículo
 * (rádios gravando, canais YT, perfis IG, buscas X, páginas/termos Ads).
 */
export async function buscarEvolucaoPanoramaFontes(params: {
  fonte: FontePanorama;
  termo?: string;
  janela?: JanelaPanorama;
  limite?: number;
}): Promise<{ series: SerieEvolucaoFonte[]; pontos: PontoEvolucaoFontes[] }> {
  const janela = params.janela ?? "24h";
  const trunc = janela === "24h" ? "hour" : "day";
  const buckets = montarBucketsEvolucao(janela);
  const limite = Math.min(
    Math.max(params.limite ?? LIMITE_SERIES_FONTE, 1),
    24,
  );

  const vazios = (): { series: SerieEvolucaoFonte[]; pontos: PontoEvolucaoFontes[] } => ({
    series: [],
    pontos: buckets.map((b) => ({
      hora: b.toISOString(),
      valores: {},
      total: 0,
    })),
  });

  if (!isDatabaseConfigured()) return vazios();

  const desde = buckets[0]!.toISOString();
  const busca = termoSql(params.termo);
  const monitoradas = await listarSeriesMonitoradas(params.fonte);
  const sqlEventos = sqlEventosPorFonte(params.fonte, trunc);
  if (!sqlEventos) return vazios();

  const result = await getPool().query<{
    hora: Date;
    serie_id: string;
    serie_label: string;
    total: string;
  }>(
    `SELECT hora, serie_id, serie_label, COUNT(*)::text AS total
     FROM (${sqlEventos}) AS eventos
     WHERE (
         $2::text IS NULL
         OR termo ILIKE $2
         OR contexto ILIKE $2
         OR titulo_extra ILIKE $2
         OR translate(lower(termo), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $3
         OR translate(lower(contexto), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $3
       )
     GROUP BY hora, serie_id, serie_label
     ORDER BY hora ASC`,
    [desde, busca.ilike, busca.normalizado],
  );

  const totais = new Map<string, number>();
  const labels = new Map<string, string>();
  for (const m of monitoradas) {
    labels.set(m.id, m.label);
    totais.set(m.id, 0);
  }

  for (const row of result.rows) {
    const id = row.serie_id;
    if (!id) continue;
    labels.set(id, row.serie_label || id);
    totais.set(id, (totais.get(id) ?? 0) + Number(row.total ?? 0));
  }

  // Prioriza monitoradas; completa com as que mais mentaram no período.
  const idsMonitorados = new Set(monitoradas.map((m) => m.id));
  const ranqueadas = [...totais.entries()].sort((a, b) => {
    const am = idsMonitorados.has(a[0]) ? 1 : 0;
    const bm = idsMonitorados.has(b[0]) ? 1 : 0;
    if (am !== bm) return bm - am;
    return b[1] - a[1];
  });

  const series = ranqueadas.slice(0, limite).map(([id]) => ({
    id,
    label: labels.get(id) ?? id,
  }));

  if (series.length === 0) {
    return {
      series: monitoradas.slice(0, limite),
      pontos: buckets.map((b) => ({
        hora: b.toISOString(),
        valores: Object.fromEntries(monitoradas.slice(0, limite).map((s) => [s.id, 0])),
        total: 0,
      })),
    };
  }

  const ids = new Set(series.map((s) => s.id));
  const porBucket = new Map<string, PontoEvolucaoFontes>();
  for (const bucket of buckets) {
    const hora = bucket.toISOString();
    porBucket.set(hora, {
      hora,
      valores: Object.fromEntries(series.map((s) => [s.id, 0])),
      total: 0,
    });
  }

  for (const row of result.rows) {
    if (!ids.has(row.serie_id)) continue;
    const chave = new Date(row.hora).toISOString();
    const ponto = porBucket.get(chave);
    if (!ponto) continue;
    const n = Number(row.total ?? 0);
    ponto.valores[row.serie_id] = n;
    ponto.total += n;
  }

  return { series, pontos: [...porBucket.values()] };
}

async function listarSeriesMonitoradas(
  fonte: FontePanorama,
): Promise<SerieEvolucaoFonte[]> {
  if (fonte === "radio") {
    const emissoras = await readEmissoras();
    const series: SerieEvolucaoFonte[] = [];
    for (const [municipio, dados] of Object.entries(emissoras)) {
      for (const radio of dados.radios) {
        if (!radio.gravar) continue;
        series.push({
          id: `${municipio}|${radio.nome}`,
          label: `${radio.nome} · ${municipio}`,
        });
      }
    }
    return series.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }

  if (fonte === "youtube") {
    const canais = await listarYoutubeCanaisAtivos();
    return canais.map((c) => ({
      id: `yt:${c.id}`,
      label: c.titulo || c.channel_id,
    }));
  }

  if (fonte === "instagram") {
    const perfis = await listarInstagramPerfisAtivos();
    return perfis.map((p) => ({
      id: `ig:${p.id}`,
      label: `@${p.username}`,
    }));
  }

  if (fonte === "x") {
    const buscas = await listarXBuscasAtivas();
    return buscas.map((b) => ({
      id: `x:${b.id}`,
      label: b.termo,
    }));
  }

  const [paginas, buscas] = await Promise.all([
    listarMetaAdsPaginasAtivas(),
    listarMetaAdsBuscasAtivas(),
  ]);
  return [
    ...paginas.map((p) => ({
      id: `ads-pag:${p.id}`,
      label: p.titulo || p.slug,
    })),
    ...buscas.map((b) => ({
      id: `ads-busca:${b.id}`,
      label: `Busca · ${b.termo}`,
    })),
  ];
}

/** Subquery com colunas: hora, serie_id, serie_label, termo, contexto, titulo_extra */
function sqlEventosPorFonte(fonte: FontePanorama, trunc: "hour" | "day"): string | null {
  if (fonte === "radio") {
    return `
      SELECT
        date_trunc('${trunc}', d.detectado_em) AS hora,
        (g.municipio || '|' || g.radio_nome) AS serie_id,
        (g.radio_nome || ' · ' || g.municipio) AS serie_label,
        d.termo,
        d.contexto,
        NULL::text AS titulo_extra
      FROM palavra_deteccoes d
      JOIN gravacao_arquivos g ON g.id = d.gravacao_id
      WHERE g.removido_em IS NULL
        AND d.detectado_em >= $1::timestamptz
    `;
  }

  if (fonte === "youtube") {
    return `
      SELECT
        date_trunc('${trunc}', d.detectado_em) AS hora,
        ('yt:' || c.id::text) AS serie_id,
        COALESCE(NULLIF(c.titulo, ''), c.channel_id) AS serie_label,
        d.termo,
        d.contexto,
        v.titulo AS titulo_extra
      FROM youtube_palavra_deteccoes d
      JOIN youtube_videos v ON v.id = d.video_db_id
      JOIN youtube_canais c ON c.id = v.canal_id
      WHERE d.detectado_em >= $1::timestamptz
    `;
  }

  if (fonte === "instagram") {
    return `
      SELECT
        date_trunc('${trunc}', d.detectado_em) AS hora,
        CASE
          WHEN posts.perfil_id IS NOT NULL THEN ('ig:' || posts.perfil_id::text)
          ELSE ('ig-user:' || lower(COALESCE(NULLIF(posts.owner_username, ''), 'instagram')))
        END AS serie_id,
        ('@' || COALESCE(NULLIF(p.username, ''), NULLIF(posts.owner_username, ''), 'instagram')) AS serie_label,
        d.termo,
        d.contexto,
        NULL::text AS titulo_extra
      FROM instagram_palavra_deteccoes d
      JOIN instagram_posts posts ON posts.id = d.post_db_id
      LEFT JOIN instagram_perfis p ON p.id = posts.perfil_id
      WHERE d.detectado_em >= $1::timestamptz
    `;
  }

  if (fonte === "x") {
    return `
      SELECT
        date_trunc('${trunc}', d.detectado_em) AS hora,
        CASE
          WHEN posts.busca_id IS NOT NULL THEN ('x:' || posts.busca_id::text)
          ELSE ('x-user:' || lower(COALESCE(NULLIF(posts.autor_username, ''), 'x')))
        END AS serie_id,
        COALESCE(
          NULLIF(b.termo, ''),
          ('@' || COALESCE(NULLIF(posts.autor_username, ''), 'x'))
        ) AS serie_label,
        d.termo,
        d.contexto,
        NULL::text AS titulo_extra
      FROM x_palavra_deteccoes d
      JOIN x_posts posts ON posts.id = d.post_db_id
      LEFT JOIN x_buscas b ON b.id = posts.busca_id
      WHERE d.detectado_em >= $1::timestamptz
    `;
  }

  if (fonte === "meta_ads") {
    return `
      SELECT
        date_trunc('${trunc}', d.detectado_em) AS hora,
        CASE
          WHEN ads.pagina_id IS NOT NULL THEN ('ads-pag:' || ads.pagina_id::text)
          WHEN ads.busca_id IS NOT NULL THEN ('ads-busca:' || ads.busca_id::text)
          ELSE ('ads-page:' || lower(COALESCE(NULLIF(ads.page_name, ''), 'anunciante')))
        END AS serie_id,
        COALESCE(
          NULLIF(p.titulo, ''),
          NULLIF(p.slug, ''),
          CASE WHEN b.termo IS NOT NULL THEN ('Busca · ' || b.termo) END,
          NULLIF(ads.page_name, ''),
          'Anunciante'
        ) AS serie_label,
        d.termo,
        d.contexto,
        NULL::text AS titulo_extra
      FROM meta_ads_palavra_deteccoes d
      JOIN meta_ads ads ON ads.id = d.ad_db_id
      LEFT JOIN meta_ads_buscas b ON b.id = ads.busca_id
      LEFT JOIN meta_ads_paginas p ON p.id = ads.pagina_id
      WHERE d.detectado_em >= $1::timestamptz
    `;
  }

  return null;
}

function pontoVazio(hora: string): PontoEvolucaoPanorama {
  return {
    hora,
    radio: 0,
    youtube: 0,
    instagram: 0,
    x: 0,
    meta_ads: 0,
    total: 0,
  };
}

function montarBucketsEvolucao(janela: JanelaPanorama): Date[] {
  const agora = new Date();

  if (janela === "24h") {
    const inicio = new Date(agora);
    inicio.setMinutes(0, 0, 0);
    inicio.setHours(inicio.getHours() - 23);
    return Array.from({ length: 24 }, (_, i) => {
      const h = new Date(inicio);
      h.setHours(inicio.getHours() + i);
      return h;
    });
  }

  const dias = janela === "7d" ? 7 : 30;
  const inicio = new Date(agora);
  inicio.setHours(0, 0, 0, 0);
  inicio.setDate(inicio.getDate() - (dias - 1));

  return Array.from({ length: dias }, (_, i) => {
    const d = new Date(inicio);
    d.setDate(inicio.getDate() + i);
    return d;
  });
}
