import { getPool, isDatabaseConfigured } from "@/lib/db";

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

  const values: unknown[] = [];
  const placeholders: string[] = [];

  segmentos.forEach((segmento, index) => {
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

export async function listarSegmentosYoutube(
  videoDbId: number,
  limite = 200,
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

export async function listarPreviewsTranscricaoYoutube(
  limiteVideos = 5,
): Promise<
  {
    videoDbId: number;
    videoId: string;
    titulo: string;
    canalTitulo: string;
    segmentos: YoutubeTranscricaoSegmento[];
  }[]
> {
  if (!isDatabaseConfigured()) return [];

  const videos = await getPool().query<{
    id: number;
    video_id: string;
    titulo: string;
    canal_titulo: string;
  }>(
    `SELECT v.id, v.video_id, v.titulo, c.titulo AS canal_titulo
     FROM youtube_videos v
     JOIN youtube_canais c ON c.id = v.canal_id
     WHERE v.status = 'concluido'
     ORDER BY v.processado_em DESC NULLS LAST
     LIMIT $1`,
    [limiteVideos],
  );

  const previews = [];
  for (const video of videos.rows) {
    const segmentos = await listarSegmentosYoutube(video.id, 80);
    previews.push({
      videoDbId: video.id,
      videoId: video.video_id,
      titulo: video.titulo,
      canalTitulo: video.canal_titulo,
      segmentos,
    });
  }

  return previews;
}
