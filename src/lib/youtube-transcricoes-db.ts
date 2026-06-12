import { getPool, isDatabaseConfigured } from "@/lib/db";
import { normalizeText } from "@/lib/text-normalize";

export interface YoutubeTranscricaoSegmento {
  id: number;
  video_db_id: number;
  inicio_segundos: number;
  fim_segundos: number;
  texto: string;
}

export async function salvarSegmentosYoutube(
  videoDbId: number,
  segmentos: { inicioSegundos: number; fimSegundos: number; texto: string }[],
): Promise<void> {
  if (!isDatabaseConfigured() || segmentos.length === 0) return;

  await getPool().query(`DELETE FROM youtube_transcricao_segmentos WHERE video_db_id = $1`, [
    videoDbId,
  ]);

  const CHUNK_SIZE = 250;
  for (let offset = 0; offset < segmentos.length; offset += CHUNK_SIZE) {
    const chunk = segmentos.slice(offset, offset + CHUNK_SIZE);
    const values: unknown[] = [];
    const placeholders: string[] = [];

    chunk.forEach((segmento, index) => {
      const base = index * 4;
      placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
      values.push(videoDbId, segmento.inicioSegundos, segmento.fimSegundos, segmento.texto);
    });

    await getPool().query(
      `INSERT INTO youtube_transcricao_segmentos (video_db_id, inicio_segundos, fim_segundos, texto)
       VALUES ${placeholders.join(", ")}`,
      values,
    );
  }
}

export async function listarSegmentosYoutube(
  videoDbId: number,
  limite = 5000,
): Promise<YoutubeTranscricaoSegmento[]> {
  if (!isDatabaseConfigured()) return [];

  const result = await getPool().query<YoutubeTranscricaoSegmento>(
    `SELECT id, video_db_id, inicio_segundos, fim_segundos, texto
     FROM youtube_transcricao_segmentos
     WHERE video_db_id = $1
     ORDER BY inicio_segundos ASC
     LIMIT $2`,
    [videoDbId, limite],
  );

  return result.rows.map((row) => ({
    ...row,
    inicio_segundos: Number(row.inicio_segundos),
    fim_segundos: Number(row.fim_segundos),
  }));
}

export async function listarResumosTranscricaoYoutube(
  limiteVideos = 8,
): Promise<
  {
    videoDbId: number;
    videoId: string;
    titulo: string;
    canalTitulo: string;
    segmentosTotal: number;
    resumo: string;
    duracaoSegundos: number | null;
  }[]
> {
  if (!isDatabaseConfigured()) return [];

  const videos = await getPool().query<{
    id: number;
    video_id: string;
    titulo: string;
    canal_titulo: string;
    segmentos_total: string;
    resumo: string | null;
    duracao_segundos: string | null;
  }>(
    `SELECT
       v.id,
       v.video_id,
       v.titulo,
       c.titulo AS canal_titulo,
       COUNT(s.id)::text AS segmentos_total,
       LEFT((ARRAY_AGG(s.texto ORDER BY s.inicio_segundos))[1], 180) AS resumo,
       MAX(s.fim_segundos)::text AS duracao_segundos
     FROM youtube_videos v
     JOIN youtube_canais c ON c.id = v.canal_id
     LEFT JOIN youtube_transcricao_segmentos s ON s.video_db_id = v.id
     WHERE v.status = 'concluido'
     GROUP BY v.id, v.video_id, v.titulo, c.titulo, v.processado_em
     ORDER BY v.processado_em DESC NULLS LAST
     LIMIT $1`,
    [limiteVideos],
  );

  return videos.rows.map((row) => ({
    videoDbId: row.id,
    videoId: row.video_id,
    titulo: row.titulo,
    canalTitulo: row.canal_titulo,
    segmentosTotal: Number(row.segmentos_total ?? 0),
    resumo: row.resumo?.trim() || "Sem trechos",
    duracaoSegundos: row.duracao_segundos ? Number(row.duracao_segundos) : null,
  }));
}

export interface YoutubeTranscricaoBuscaResultado {
  id: number;
  video_db_id: number;
  inicio_segundos: number;
  fim_segundos: number;
  texto: string;
  video_id: string;
  video_titulo: string;
  canal_titulo: string;
  publicado_em: string | null;
}

function termoBuscaSql(termo: string): { ilike: string; normalizado: string } {
  const trimmed = termo.trim();
  return {
    ilike: `%${trimmed}%`,
    normalizado: `%${normalizeText(trimmed)}%`,
  };
}

export async function contarBuscaNasTranscricoesYoutube(termo: string): Promise<number> {
  if (!isDatabaseConfigured() || !termo.trim()) return 0;

  const busca = termoBuscaSql(termo);

  const result = await getPool().query<{ total: string }>(
    `SELECT COUNT(*)::text AS total
     FROM youtube_transcricao_segmentos s
     JOIN youtube_videos v ON v.id = s.video_db_id
     WHERE v.status = 'concluido'
       AND (
         s.texto ILIKE $1
         OR translate(lower(s.texto), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $2
       )`,
    [busca.ilike, busca.normalizado],
  );

  return Number(result.rows[0]?.total ?? 0);
}

export async function buscarNasTranscricoesYoutube(params: {
  termo: string;
  limite?: number;
  offset?: number;
}): Promise<YoutubeTranscricaoBuscaResultado[]> {
  if (!isDatabaseConfigured() || !params.termo.trim()) return [];

  const limite = Math.min(Math.max(params.limite ?? 30, 1), 200);
  const offset = Math.max(params.offset ?? 0, 0);
  const busca = termoBuscaSql(params.termo);

  const result = await getPool().query<YoutubeTranscricaoBuscaResultado & { publicado_em: Date | null }>(
    `SELECT
       s.id,
       s.video_db_id,
       s.inicio_segundos,
       s.fim_segundos,
       s.texto,
       v.video_id,
       v.titulo AS video_titulo,
       c.titulo AS canal_titulo,
       v.publicado_em
     FROM youtube_transcricao_segmentos s
     JOIN youtube_videos v ON v.id = s.video_db_id
     JOIN youtube_canais c ON c.id = v.canal_id
     WHERE v.status = 'concluido'
       AND (
         s.texto ILIKE $1
         OR translate(lower(s.texto), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $2
       )
     ORDER BY v.publicado_em DESC NULLS LAST, s.inicio_segundos ASC
     LIMIT $3 OFFSET $4`,
    [busca.ilike, busca.normalizado, limite, offset],
  );

  return result.rows.map((row) => ({
    ...row,
    inicio_segundos: Number(row.inicio_segundos),
    fim_segundos: Number(row.fim_segundos),
    publicado_em: row.publicado_em ? new Date(row.publicado_em).toISOString() : null,
  }));
}
