import { getPool, isDatabaseConfigured } from "@/lib/db";

export interface YoutubePalavraDeteccao {
  id: number;
  palavra_chave_id: number | null;
  video_db_id: number;
  termo: string;
  inicio_segundos: number;
  fim_segundos: number;
  contexto: string;
  detectado_em: string;
  video_id: string;
  video_titulo: string;
  canal_titulo: string;
}

export async function registrarDeteccaoYoutube(input: {
  palavraChaveId: number | null;
  videoDbId: number;
  termo: string;
  inicioSegundos: number;
  fimSegundos: number;
  contexto: string;
}): Promise<YoutubePalavraDeteccao | null> {
  if (!isDatabaseConfigured()) return null;

  const duplicata = await getPool().query<{ id: number }>(
    `SELECT id
     FROM youtube_palavra_deteccoes
     WHERE video_db_id = $1
       AND termo = $2
       AND ABS(inicio_segundos - $3) < 2
     LIMIT 1`,
    [input.videoDbId, input.termo, input.inicioSegundos],
  );

  if (duplicata.rows[0]) {
    return obterDeteccaoYoutubePorId(duplicata.rows[0].id);
  }

  const result = await getPool().query<{ id: number }>(
    `INSERT INTO youtube_palavra_deteccoes (
       palavra_chave_id, video_db_id, termo, inicio_segundos, fim_segundos, contexto
     )
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      input.palavraChaveId,
      input.videoDbId,
      input.termo,
      input.inicioSegundos,
      input.fimSegundos,
      input.contexto,
    ],
  );

  const id = result.rows[0]?.id;
  if (!id) return null;

  return obterDeteccaoYoutubePorId(id);
}

export async function obterDeteccaoYoutubePorId(
  id: number,
): Promise<YoutubePalavraDeteccao | null> {
  if (!isDatabaseConfigured()) return null;

  const result = await getPool().query<YoutubePalavraDeteccao>(
    `SELECT
       d.id,
       d.palavra_chave_id,
       d.video_db_id,
       d.termo,
       d.inicio_segundos,
       d.fim_segundos,
       d.contexto,
       d.detectado_em,
       v.video_id,
       v.titulo AS video_titulo,
       c.titulo AS canal_titulo
     FROM youtube_palavra_deteccoes d
     JOIN youtube_videos v ON v.id = d.video_db_id
     JOIN youtube_canais c ON c.id = v.canal_id
     WHERE d.id = $1`,
    [id],
  );

  const row = result.rows[0];
  if (!row) return null;

  return mapDeteccao(row);
}

export async function buscarDeteccoesYoutube(params: {
  canalId?: number;
  termo?: string;
  limite?: number;
}): Promise<YoutubePalavraDeteccao[]> {
  if (!isDatabaseConfigured()) return [];

  const limite = Math.min(Math.max(params.limite ?? 50, 1), 200);

  const result = await getPool().query<YoutubePalavraDeteccao>(
    `SELECT
       d.id,
       d.palavra_chave_id,
       d.video_db_id,
       d.termo,
       d.inicio_segundos,
       d.fim_segundos,
       d.contexto,
       d.detectado_em,
       v.video_id,
       v.titulo AS video_titulo,
       c.titulo AS canal_titulo
     FROM youtube_palavra_deteccoes d
     JOIN youtube_videos v ON v.id = d.video_db_id
     JOIN youtube_canais c ON c.id = v.canal_id
     WHERE ($1::int IS NULL OR v.canal_id = $1)
       AND ($2::text IS NULL OR d.termo ILIKE $2)
     ORDER BY d.detectado_em DESC
     LIMIT $3`,
    [params.canalId ?? null, params.termo ? `%${params.termo}%` : null, limite],
  );

  return result.rows.map(mapDeteccao);
}

function mapDeteccao(row: YoutubePalavraDeteccao): YoutubePalavraDeteccao {
  return {
    ...row,
    inicio_segundos: Number(row.inicio_segundos),
    fim_segundos: Number(row.fim_segundos),
    detectado_em: new Date(row.detectado_em).toISOString(),
  };
}
