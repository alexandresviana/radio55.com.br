import { getPool, isDatabaseConfigured } from "@/lib/db";

export type YoutubeVideoStatus =
  | "pendente"
  | "processando"
  | "concluido"
  | "erro"
  | "sem_transcript"
  | "aguardando";

export interface YoutubeCanal {
  id: number;
  channel_id: string;
  titulo: string;
  url_entrada: string;
  ativo: boolean;
  ultima_verificacao_em: string | null;
  criado_em: string;
  videos_total?: number;
  videos_pendentes?: number;
}

export interface YoutubeVideo {
  id: number;
  canal_id: number;
  video_id: string;
  titulo: string;
  publicado_em: string | null;
  status: YoutubeVideoStatus;
  erro_msg: string | null;
  processado_em: string | null;
  criado_em: string;
  canal_titulo?: string;
  segmentos_total?: number;
}

export async function listarYoutubeCanais(): Promise<YoutubeCanal[]> {
  if (!isDatabaseConfigured()) return [];

  const result = await getPool().query<YoutubeCanal & { videos_total: string; videos_pendentes: string }>(
    `SELECT
       c.id,
       c.channel_id,
       c.titulo,
       c.url_entrada,
       c.ativo,
       c.ultima_verificacao_em,
       c.criado_em,
       COUNT(v.id)::text AS videos_total,
       COUNT(v.id) FILTER (WHERE v.status IN ('pendente', 'processando'))::text AS videos_pendentes
     FROM youtube_canais c
     LEFT JOIN youtube_videos v ON v.canal_id = c.id
     GROUP BY c.id
     ORDER BY c.titulo ASC`,
  );

  return result.rows.map(mapCanal);
}

export async function listarYoutubeCanaisAtivos(): Promise<YoutubeCanal[]> {
  if (!isDatabaseConfigured()) return [];

  const result = await getPool().query<YoutubeCanal>(
    `SELECT id, channel_id, titulo, url_entrada, ativo, ultima_verificacao_em, criado_em
     FROM youtube_canais
     WHERE ativo = TRUE
     ORDER BY id ASC`,
  );

  return result.rows.map(mapCanal);
}

export async function criarYoutubeCanal(input: {
  channelId: string;
  titulo: string;
  urlEntrada: string;
}): Promise<YoutubeCanal> {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL não configurado");
  }

  const result = await getPool().query<YoutubeCanal>(
    `INSERT INTO youtube_canais (channel_id, titulo, url_entrada, ativo)
     VALUES ($1, $2, $3, TRUE)
     RETURNING id, channel_id, titulo, url_entrada, ativo, ultima_verificacao_em, criado_em`,
    [input.channelId, input.titulo, input.urlEntrada],
  );

  const row = result.rows[0];
  if (!row) throw new Error("Falha ao criar canal");

  return mapCanal(row);
}

export async function atualizarYoutubeCanal(
  id: number,
  patch: { ativo?: boolean; titulo?: string },
): Promise<YoutubeCanal | null> {
  if (!isDatabaseConfigured()) return null;

  const result = await getPool().query<YoutubeCanal>(
    `UPDATE youtube_canais
     SET
       ativo = COALESCE($2, ativo),
       titulo = COALESCE($3, titulo)
     WHERE id = $1
     RETURNING id, channel_id, titulo, url_entrada, ativo, ultima_verificacao_em, criado_em`,
    [id, patch.ativo ?? null, patch.titulo ?? null],
  );

  const row = result.rows[0];
  return row ? mapCanal(row) : null;
}

export async function removerYoutubeCanal(id: number): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;

  const result = await getPool().query(`DELETE FROM youtube_canais WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function marcarCanalVerificado(id: number): Promise<void> {
  if (!isDatabaseConfigured()) return;

  await getPool().query(
    `UPDATE youtube_canais SET ultima_verificacao_em = NOW() WHERE id = $1`,
    [id],
  );
}

export async function registrarVideoYoutube(input: {
  canalId: number;
  videoId: string;
  titulo: string;
  publicadoEm: Date;
}): Promise<"novo" | "existente"> {
  if (!isDatabaseConfigured()) return "existente";

  const result = await getPool().query<{ id: number }>(
    `INSERT INTO youtube_videos (canal_id, video_id, titulo, publicado_em, status)
     VALUES ($1, $2, $3, $4, 'pendente')
     ON CONFLICT (video_id) DO NOTHING
     RETURNING id`,
    [input.canalId, input.videoId, input.titulo, input.publicadoEm.toISOString()],
  );

  return result.rows[0] ? "novo" : "existente";
}

export async function obterProximoVideoPendente(): Promise<YoutubeVideo | null> {
  if (!isDatabaseConfigured()) return null;

  const result = await getPool().query<YoutubeVideo>(
    `SELECT
       v.id,
       v.canal_id,
       v.video_id,
       v.titulo,
       v.publicado_em,
       v.status,
       v.erro_msg,
       v.processado_em,
       v.criado_em,
       c.titulo AS canal_titulo
     FROM youtube_videos v
     JOIN youtube_canais c ON c.id = v.canal_id
     WHERE c.ativo = TRUE
       AND (
         v.status IN ('pendente', 'aguardando')
         OR (
           v.status = 'sem_transcript'
           AND COALESCE(v.tentativas, 0) < 5
           AND v.publicado_em IS NOT NULL
           AND v.publicado_em < NOW()
         )
         OR (
           v.status = 'concluido'
           AND COALESCE(v.duracao_video_segundos, 0) > 120
           AND COALESCE((
             SELECT MAX(s.fim_segundos)
             FROM youtube_transcricao_segmentos s
             WHERE s.video_db_id = v.id
           ), 0) < v.duracao_video_segundos * 0.7
           AND COALESCE(v.tentativas, 0) < 3
         )
       )
     ORDER BY
       CASE v.status
         WHEN 'pendente' THEN 0
         WHEN 'aguardando' THEN 1
         ELSE 2
       END,
       v.publicado_em DESC NULLS LAST,
       v.id ASC
     LIMIT 1`,
  );

  const row = result.rows[0];
  return row ? mapVideo(row) : null;
}

export async function salvarDuracaoVideoYoutube(
  id: number,
  duracaoSegundos: number,
): Promise<void> {
  if (!isDatabaseConfigured()) return;

  await getPool().query(
    `UPDATE youtube_videos SET duracao_video_segundos = $2 WHERE id = $1`,
    [id, duracaoSegundos],
  );
}

export async function atualizarStatusVideoYoutube(
  id: number,
  status: YoutubeVideoStatus,
  erroMsg?: string | null,
): Promise<void> {
  if (!isDatabaseConfigured()) return;

  await getPool().query(
    `UPDATE youtube_videos
     SET
       status = $2,
       erro_msg = $3,
       tentativas = CASE
         WHEN $2 IN ('sem_transcript', 'erro', 'aguardando') THEN COALESCE(tentativas, 0) + 1
         ELSE tentativas
       END,
       processado_em = CASE
         WHEN $2 IN ('concluido', 'erro', 'sem_transcript', 'aguardando') THEN NOW()
         ELSE processado_em
       END
     WHERE id = $1`,
    [id, status, erroMsg ?? null],
  );
}

export async function buscarYoutubeVideos(params: {
  canalId?: number;
  status?: YoutubeVideoStatus;
  limite?: number;
}): Promise<YoutubeVideo[]> {
  if (!isDatabaseConfigured()) return [];

  const limite = Math.min(Math.max(params.limite ?? 50, 1), 200);

  const result = await getPool().query<YoutubeVideo & { segmentos_total: string }>(
    `SELECT
       v.id,
       v.canal_id,
       v.video_id,
       v.titulo,
       v.publicado_em,
       v.status,
       v.erro_msg,
       v.processado_em,
       v.criado_em,
       c.titulo AS canal_titulo,
       COUNT(s.id)::text AS segmentos_total
     FROM youtube_videos v
     JOIN youtube_canais c ON c.id = v.canal_id
     LEFT JOIN youtube_transcricao_segmentos s ON s.video_db_id = v.id
     WHERE ($1::int IS NULL OR v.canal_id = $1)
       AND ($2::text IS NULL OR v.status = $2)
     GROUP BY v.id, c.titulo
     ORDER BY v.publicado_em DESC NULLS LAST, v.id DESC
     LIMIT $3`,
    [params.canalId ?? null, params.status ?? null, limite],
  );

  return result.rows.map((row) => ({
    ...mapVideo(row),
    segmentos_total: Number(row.segmentos_total ?? 0),
  }));
}

export async function obterYoutubeVideoPorId(id: number): Promise<YoutubeVideo | null> {
  if (!isDatabaseConfigured()) return null;

  const result = await getPool().query<YoutubeVideo>(
    `SELECT
       v.id,
       v.canal_id,
       v.video_id,
       v.titulo,
       v.publicado_em,
       v.status,
       v.erro_msg,
       v.processado_em,
       v.criado_em,
       c.titulo AS canal_titulo
     FROM youtube_videos v
     JOIN youtube_canais c ON c.id = v.canal_id
     WHERE v.id = $1`,
    [id],
  );

  const row = result.rows[0];
  return row ? mapVideo(row) : null;
}

function mapCanal(
  row: Omit<YoutubeCanal, "videos_total" | "videos_pendentes"> & {
    videos_total?: string | number;
    videos_pendentes?: string | number;
  },
): YoutubeCanal {
  return {
    ...row,
    ativo: Boolean(row.ativo),
    ultima_verificacao_em: row.ultima_verificacao_em
      ? new Date(row.ultima_verificacao_em).toISOString()
      : null,
    criado_em: new Date(row.criado_em).toISOString(),
    videos_total:
      row.videos_total !== undefined && row.videos_total !== null
        ? Number(row.videos_total)
        : undefined,
    videos_pendentes:
      row.videos_pendentes !== undefined && row.videos_pendentes !== null
        ? Number(row.videos_pendentes)
        : undefined,
  };
}

function mapVideo(row: YoutubeVideo): YoutubeVideo {
  return {
    ...row,
    publicado_em: row.publicado_em ? new Date(row.publicado_em).toISOString() : null,
    processado_em: row.processado_em ? new Date(row.processado_em).toISOString() : null,
    criado_em: new Date(row.criado_em).toISOString(),
  };
}
