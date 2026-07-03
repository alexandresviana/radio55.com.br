import { getPool, isDatabaseConfigured } from "@/lib/db";
import { normalizeText } from "@/lib/text-normalize";

export interface FiltrosBuscaTranscricao {
  termos: string[];
  radio_nome?: string | null;
  municipio?: string | null;
  canal_youtube?: string | null;
  data?: string | null;
  hora_de?: string | null;
  hora_ate?: string | null;
  limite?: number;
  offset?: number;
}

export interface TrechoRadioEncontrado {
  tipo: "radio";
  id: number;
  gravacao_id: number;
  texto: string;
  inicio_segundos: number;
  momento_iso: string;
  municipio: string;
  radio_nome: string;
  arquivo: string;
  termo_detectado?: string;
}

export interface TrechoYoutubeEncontrado {
  tipo: "youtube";
  id: number;
  video_db_id: number;
  texto: string;
  inicio_segundos: number;
  momento_iso: string | null;
  video_id: string;
  video_titulo: string;
  canal_titulo: string;
}

function sqlTermosColuna(
  coluna: string,
  termos: string[],
  paramOffset: number,
): { clause: string; values: string[] } {
  if (termos.length === 0) {
    return { clause: "TRUE", values: [] };
  }

  const parts: string[] = [];
  const values: string[] = [];

  termos.forEach((termo, index) => {
    const ilike = `%${termo.trim()}%`;
    const normalizado = `%${normalizeText(termo)}%`;
    const base = paramOffset + index * 2;
    parts.push(
      `(${coluna} ILIKE $${base} OR translate(lower(${coluna}), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $${base + 1})`,
    );
    values.push(ilike, normalizado);
  });

  return { clause: `(${parts.join(" OR ")})`, values };
}

function sqlTermos(alias: string, termos: string[], paramOffset: number) {
  return sqlTermosColuna(`${alias}.texto`, termos, paramOffset);
}

function sqlTermosDeteccao(termos: string[], paramOffset: number) {
  if (termos.length === 0) {
    return { clause: "TRUE", values: [] };
  }

  const parts: string[] = [];
  const values: string[] = [];

  termos.forEach((termo, index) => {
    const ilike = `%${termo.trim()}%`;
    const normalizado = `%${normalizeText(termo)}%`;
    const base = paramOffset + index * 2;
    parts.push(
      `(d.termo ILIKE $${base} OR d.contexto ILIKE $${base}
        OR translate(lower(d.termo), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $${base + 1}
        OR translate(lower(d.contexto), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') LIKE $${base + 1})`,
    );
    values.push(ilike, normalizado);
  });

  return { clause: `(${parts.join(" OR ")})`, values };
}

function momentoRadioSql(): string {
  return `(g.gravado_em + (s.inicio_segundos * INTERVAL '1 second'))`;
}

function momentoDeteccaoSql(): string {
  return `(g.gravado_em + (d.inicio_segundos * INTERVAL '1 second'))`;
}

/** Data/hora no fuso de Sergipe — evita perder ocorrências por UTC. */
function dataLocalSql(momentoExpr: string): string {
  return `(${momentoExpr} AT TIME ZONE 'America/Sao_Paulo')`;
}

function momentoYoutubeSql(): string {
  return `(v.publicado_em + (s.inicio_segundos * INTERVAL '1 second'))`;
}

export async function buscarTrechosRadio(
  filtros: FiltrosBuscaTranscricao,
): Promise<TrechoRadioEncontrado[]> {
  if (!isDatabaseConfigured()) return [];

  const limite = Math.min(Math.max(filtros.limite ?? 25, 1), 80);
  const offset = Math.max(filtros.offset ?? 0, 0);
  const termos = filtros.termos.map((t) => t.trim()).filter(Boolean);
  const termoSql = sqlTermos("s", termos, 1);

  const values: unknown[] = [...termoSql.values];
  let param = termoSql.values.length + 1;
  const extras: string[] = [];

  if (filtros.radio_nome?.trim()) {
    extras.push(`g.radio_nome ILIKE $${param}`);
    values.push(`%${filtros.radio_nome.trim()}%`);
    param++;
  }

  if (filtros.municipio?.trim()) {
    extras.push(`g.municipio ILIKE $${param}`);
    values.push(`%${filtros.municipio.trim()}%`);
    param++;
  }

  if (filtros.data?.trim()) {
    extras.push(`${dataLocalSql(momentoRadioSql())}::date = $${param}::date`);
    values.push(filtros.data.trim());
    param++;
  }

  if (filtros.hora_de?.trim()) {
    extras.push(`${dataLocalSql(momentoRadioSql())}::time >= $${param}::time`);
    values.push(filtros.hora_de.trim());
    param++;
  }

  if (filtros.hora_ate?.trim()) {
    extras.push(`${dataLocalSql(momentoRadioSql())}::time <= $${param}::time`);
    values.push(filtros.hora_ate.trim());
    param++;
  }

  values.push(limite, offset);

  const result = await getPool().query<{
    id: number;
    gravacao_id: number;
    texto: string;
    inicio_segundos: string;
    momento: Date;
    municipio: string;
    radio_nome: string;
    arquivo: string;
  }>(
    `SELECT
       s.id,
       s.gravacao_id,
       s.texto,
       s.inicio_segundos,
       ${momentoRadioSql()} AS momento,
       g.municipio,
       g.radio_nome,
       g.arquivo
     FROM transcricao_segmentos s
     JOIN gravacao_arquivos g ON g.id = s.gravacao_id
     WHERE g.removido_em IS NULL
       AND ${termoSql.clause}
       ${extras.length ? `AND ${extras.join(" AND ")}` : ""}
     ORDER BY momento DESC
     LIMIT $${param} OFFSET $${param + 1}`,
    values,
  );

  return result.rows.map((row) => ({
    tipo: "radio" as const,
    id: row.id,
    gravacao_id: row.gravacao_id,
    texto: row.texto,
    inicio_segundos: Number(row.inicio_segundos),
    momento_iso: new Date(row.momento).toISOString(),
    municipio: row.municipio,
    radio_nome: row.radio_nome,
    arquivo: row.arquivo,
  }));
}

export async function contarTrechosRadio(filtros: FiltrosBuscaTranscricao): Promise<number> {
  if (!isDatabaseConfigured()) return 0;

  const termos = filtros.termos.map((t) => t.trim()).filter(Boolean);
  const termoSql = sqlTermos("s", termos, 1);
  const values: unknown[] = [...termoSql.values];
  let param = termoSql.values.length + 1;
  const extras: string[] = [];

  if (filtros.radio_nome?.trim()) {
    extras.push(`g.radio_nome ILIKE $${param}`);
    values.push(`%${filtros.radio_nome.trim()}%`);
    param++;
  }
  if (filtros.municipio?.trim()) {
    extras.push(`g.municipio ILIKE $${param}`);
    values.push(`%${filtros.municipio.trim()}%`);
    param++;
  }
  if (filtros.data?.trim()) {
    extras.push(`${dataLocalSql(momentoRadioSql())}::date = $${param}::date`);
    values.push(filtros.data.trim());
    param++;
  }
  if (filtros.hora_de?.trim()) {
    extras.push(`${dataLocalSql(momentoRadioSql())}::time >= $${param}::time`);
    values.push(filtros.hora_de.trim());
    param++;
  }
  if (filtros.hora_ate?.trim()) {
    extras.push(`${dataLocalSql(momentoRadioSql())}::time <= $${param}::time`);
    values.push(filtros.hora_ate.trim());
    param++;
  }

  const result = await getPool().query<{ total: string }>(
    `SELECT COUNT(*)::text AS total
     FROM transcricao_segmentos s
     JOIN gravacao_arquivos g ON g.id = s.gravacao_id
     WHERE g.removido_em IS NULL
       AND ${termoSql.clause}
       ${extras.length ? `AND ${extras.join(" AND ")}` : ""}`,
    values,
  );

  return Number(result.rows[0]?.total ?? 0);
}

export async function buscarDeteccoesRadio(
  filtros: FiltrosBuscaTranscricao,
): Promise<TrechoRadioEncontrado[]> {
  if (!isDatabaseConfigured()) return [];

  const limite = Math.min(Math.max(filtros.limite ?? 25, 1), 80);
  const offset = Math.max(filtros.offset ?? 0, 0);
  const termos = filtros.termos.map((t) => t.trim()).filter(Boolean);
  const termoSql = sqlTermosDeteccao(termos, 1);

  const values: unknown[] = [...termoSql.values];
  let param = termoSql.values.length + 1;
  const extras: string[] = [];

  if (filtros.radio_nome?.trim()) {
    extras.push(`g.radio_nome ILIKE $${param}`);
    values.push(`%${filtros.radio_nome.trim()}%`);
    param++;
  }

  if (filtros.municipio?.trim()) {
    extras.push(`g.municipio ILIKE $${param}`);
    values.push(`%${filtros.municipio.trim()}%`);
    param++;
  }

  if (filtros.data?.trim()) {
    extras.push(`${dataLocalSql(momentoDeteccaoSql())}::date = $${param}::date`);
    values.push(filtros.data.trim());
    param++;
  }

  if (filtros.hora_de?.trim()) {
    extras.push(`${dataLocalSql(momentoDeteccaoSql())}::time >= $${param}::time`);
    values.push(filtros.hora_de.trim());
    param++;
  }

  if (filtros.hora_ate?.trim()) {
    extras.push(`${dataLocalSql(momentoDeteccaoSql())}::time <= $${param}::time`);
    values.push(filtros.hora_ate.trim());
    param++;
  }

  values.push(limite, offset);

  const result = await getPool().query<{
    id: number;
    gravacao_id: number;
    contexto: string;
    termo: string;
    inicio_segundos: string;
    momento: Date;
    municipio: string;
    radio_nome: string;
    arquivo: string;
  }>(
    `SELECT
       d.id,
       d.gravacao_id,
       d.contexto,
       d.termo,
       d.inicio_segundos,
       ${momentoDeteccaoSql()} AS momento,
       g.municipio,
       g.radio_nome,
       g.arquivo
     FROM palavra_deteccoes d
     JOIN gravacao_arquivos g ON g.id = d.gravacao_id
     WHERE g.removido_em IS NULL
       AND ${termoSql.clause}
       ${extras.length ? `AND ${extras.join(" AND ")}` : ""}
     ORDER BY momento DESC
     LIMIT $${param} OFFSET $${param + 1}`,
    values,
  );

  return result.rows.map((row) => ({
    tipo: "radio" as const,
    id: row.id,
    gravacao_id: row.gravacao_id,
    texto: row.contexto,
    inicio_segundos: Number(row.inicio_segundos),
    momento_iso: new Date(row.momento).toISOString(),
    municipio: row.municipio,
    radio_nome: row.radio_nome,
    arquivo: row.arquivo,
    termo_detectado: row.termo,
  }));
}

export async function contarDeteccoesRadio(filtros: FiltrosBuscaTranscricao): Promise<number> {
  if (!isDatabaseConfigured()) return 0;

  const termos = filtros.termos.map((t) => t.trim()).filter(Boolean);
  const termoSql = sqlTermosDeteccao(termos, 1);
  const values: unknown[] = [...termoSql.values];
  let param = termoSql.values.length + 1;
  const extras: string[] = [];

  if (filtros.radio_nome?.trim()) {
    extras.push(`g.radio_nome ILIKE $${param}`);
    values.push(`%${filtros.radio_nome.trim()}%`);
    param++;
  }
  if (filtros.municipio?.trim()) {
    extras.push(`g.municipio ILIKE $${param}`);
    values.push(`%${filtros.municipio.trim()}%`);
    param++;
  }
  if (filtros.data?.trim()) {
    extras.push(`${dataLocalSql(momentoDeteccaoSql())}::date = $${param}::date`);
    values.push(filtros.data.trim());
    param++;
  }
  if (filtros.hora_de?.trim()) {
    extras.push(`${dataLocalSql(momentoDeteccaoSql())}::time >= $${param}::time`);
    values.push(filtros.hora_de.trim());
    param++;
  }
  if (filtros.hora_ate?.trim()) {
    extras.push(`${dataLocalSql(momentoDeteccaoSql())}::time <= $${param}::time`);
    values.push(filtros.hora_ate.trim());
    param++;
  }

  const result = await getPool().query<{ total: string }>(
    `SELECT COUNT(*)::text AS total
     FROM palavra_deteccoes d
     JOIN gravacao_arquivos g ON g.id = d.gravacao_id
     WHERE g.removido_em IS NULL
       AND ${termoSql.clause}
       ${extras.length ? `AND ${extras.join(" AND ")}` : ""}`,
    values,
  );

  return Number(result.rows[0]?.total ?? 0);
}

export async function buscarTrechosYoutube(
  filtros: FiltrosBuscaTranscricao,
): Promise<TrechoYoutubeEncontrado[]> {
  if (!isDatabaseConfigured()) return [];

  const limite = Math.min(Math.max(filtros.limite ?? 25, 1), 80);
  const offset = Math.max(filtros.offset ?? 0, 0);
  const termos = filtros.termos.map((t) => t.trim()).filter(Boolean);
  const termoSql = sqlTermos("s", termos, 1);

  const values: unknown[] = [...termoSql.values];
  let param = termoSql.values.length + 1;
  const extras: string[] = [];

  if (filtros.canal_youtube?.trim()) {
    extras.push(`c.titulo ILIKE $${param}`);
    values.push(`%${filtros.canal_youtube.trim()}%`);
    param++;
  }

  if (filtros.data?.trim()) {
    extras.push(`${momentoYoutubeSql()}::date = $${param}::date`);
    values.push(filtros.data.trim());
    param++;
  }

  if (filtros.hora_de?.trim()) {
    extras.push(`${momentoYoutubeSql()}::time >= $${param}::time`);
    values.push(filtros.hora_de.trim());
    param++;
  }

  if (filtros.hora_ate?.trim()) {
    extras.push(`${momentoYoutubeSql()}::time <= $${param}::time`);
    values.push(filtros.hora_ate.trim());
    param++;
  }

  values.push(limite, offset);

  const result = await getPool().query<{
    id: number;
    video_db_id: number;
    texto: string;
    inicio_segundos: string;
    momento: Date | null;
    video_id: string;
    video_titulo: string;
    canal_titulo: string;
  }>(
    `SELECT
       s.id,
       s.video_db_id,
       s.texto,
       s.inicio_segundos,
       ${momentoYoutubeSql()} AS momento,
       v.video_id,
       v.titulo AS video_titulo,
       c.titulo AS canal_titulo
     FROM youtube_transcricao_segmentos s
     JOIN youtube_videos v ON v.id = s.video_db_id
     JOIN youtube_canais c ON c.id = v.canal_id
     WHERE v.status = 'concluido'
       AND v.publicado_em IS NOT NULL
       AND ${termoSql.clause}
       ${extras.length ? `AND ${extras.join(" AND ")}` : ""}
     ORDER BY momento DESC NULLS LAST
     LIMIT $${param} OFFSET $${param + 1}`,
    values,
  );

  return result.rows.map((row) => ({
    tipo: "youtube" as const,
    id: row.id,
    video_db_id: row.video_db_id,
    texto: row.texto,
    inicio_segundos: Number(row.inicio_segundos),
    momento_iso: row.momento ? new Date(row.momento).toISOString() : null,
    video_id: row.video_id,
    video_titulo: row.video_titulo,
    canal_titulo: row.canal_titulo,
  }));
}

export async function contarTrechosYoutube(filtros: FiltrosBuscaTranscricao): Promise<number> {
  if (!isDatabaseConfigured()) return 0;

  const termos = filtros.termos.map((t) => t.trim()).filter(Boolean);
  const termoSql = sqlTermos("s", termos, 1);
  const values: unknown[] = [...termoSql.values];
  let param = termoSql.values.length + 1;
  const extras: string[] = [];

  if (filtros.canal_youtube?.trim()) {
    extras.push(`c.titulo ILIKE $${param}`);
    values.push(`%${filtros.canal_youtube.trim()}%`);
    param++;
  }
  if (filtros.data?.trim()) {
    extras.push(`${momentoYoutubeSql()}::date = $${param}::date`);
    values.push(filtros.data.trim());
    param++;
  }
  if (filtros.hora_de?.trim()) {
    extras.push(`${momentoYoutubeSql()}::time >= $${param}::time`);
    values.push(filtros.hora_de.trim());
    param++;
  }
  if (filtros.hora_ate?.trim()) {
    extras.push(`${momentoYoutubeSql()}::time <= $${param}::time`);
    values.push(filtros.hora_ate.trim());
    param++;
  }

  const result = await getPool().query<{ total: string }>(
    `SELECT COUNT(*)::text AS total
     FROM youtube_transcricao_segmentos s
     JOIN youtube_videos v ON v.id = s.video_db_id
     JOIN youtube_canais c ON c.id = v.canal_id
     WHERE v.status = 'concluido'
       AND v.publicado_em IS NOT NULL
       AND ${termoSql.clause}
       ${extras.length ? `AND ${extras.join(" AND ")}` : ""}`,
    values,
  );

  return Number(result.rows[0]?.total ?? 0);
}
