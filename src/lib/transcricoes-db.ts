import type { PoolClient } from "pg";
import { getPool, isDatabaseConfigured, isPgUniqueViolation } from "@/lib/db";
import { formatHorarioGravacao, normalizeText } from "@/lib/text-normalize";

const PREVIEW_JANELA_SEGUNDOS = 30 * 60;
const PREVIEW_MAX_CARACTERES = 4_000;

export interface TranscricaoSegmento {
  inicio_segundos: number;
  horario: string;
  texto: string;
}

export interface TranscricaoPreview {
  gravacao_id: number;
  municipio: string;
  radio_nome: string;
  arquivo: string;
  trechos: TranscricaoSegmento[];
  segmentos: number;
  inicio_segundos: number | null;
  fim_segundos: number | null;
}

export async function salvarSegmentosTranscricao(
  gravacaoId: number,
  segmentos: { inicioSegundos: number; fimSegundos: number; texto: string }[],
): Promise<void> {
  if (!isDatabaseConfigured() || segmentos.length === 0) return;

  for (const segmento of segmentos) {
    // NFC evita "música" com acento combinante (NFD) que a busca por ILIKE não acha.
    const texto = segmento.texto.normalize("NFC").trim();
    if (!texto) continue;

    try {
      await getPool().query(
        `INSERT INTO transcricao_segmentos (gravacao_id, inicio_segundos, fim_segundos, texto)
         VALUES ($1, $2, $3, $4)`,
        [gravacaoId, segmento.inicioSegundos, segmento.fimSegundos, texto],
      );
    } catch (error) {
      if (isPgUniqueViolation(error)) continue;
      throw error;
    }
  }
}

export async function buscarPreviewsAoVivo(
  janelaSegundos = PREVIEW_JANELA_SEGUNDOS,
): Promise<TranscricaoPreview[]> {
  if (!isDatabaseConfigured()) return [];

  const result = await getPool().query<{
    gravacao_id: number;
    municipio: string;
    radio_nome: string;
    arquivo: string;
    gravado_em: Date;
    inicio_segundos: string;
    texto: string;
  }>(
    `SELECT
       g.id AS gravacao_id,
       g.municipio,
       g.radio_nome,
       g.arquivo,
       g.gravado_em,
       s.inicio_segundos,
       s.texto
     FROM gravacao_arquivos g
     JOIN transcricao_segmentos s ON s.gravacao_id = g.id
     WHERE g.em_gravacao = TRUE
       AND g.removido_em IS NULL
       AND s.inicio_segundos >= (
         SELECT COALESCE(MAX(s2.inicio_segundos), 0) - $1
         FROM transcricao_segmentos s2
         WHERE s2.gravacao_id = g.id
       )
     ORDER BY g.municipio, g.radio_nome, s.inicio_segundos ASC`,
    [janelaSegundos],
  );

  const porGravacao = new Map<
    number,
    {
      gravacao_id: number;
      municipio: string;
      radio_nome: string;
      arquivo: string;
      gravado_em: Date;
      segmentos: TranscricaoSegmento[];
    }
  >();

  for (const row of result.rows) {
    const inicioSegundos = Number(row.inicio_segundos);
    const atual = porGravacao.get(row.gravacao_id) ?? {
      gravacao_id: row.gravacao_id,
      municipio: row.municipio,
      radio_nome: row.radio_nome,
      arquivo: row.arquivo,
      gravado_em: row.gravado_em,
      segmentos: [],
    };

    atual.segmentos.push({
      inicio_segundos: inicioSegundos,
      horario: formatHorarioGravacao(row.gravado_em, inicioSegundos),
      texto: row.texto,
    });
    porGravacao.set(row.gravacao_id, atual);
  }

  return [...porGravacao.values()].map((item) => {
    let trechos = item.segmentos;
    let totalChars = trechos.reduce((sum, seg) => sum + seg.texto.length, 0);

    while (totalChars > PREVIEW_MAX_CARACTERES && trechos.length > 1) {
      totalChars -= trechos[0]?.texto.length ?? 0;
      trechos = trechos.slice(1);
    }

    const inicio = trechos[0]?.inicio_segundos ?? null;
    const fim = trechos.at(-1)?.inicio_segundos ?? null;

    return {
      gravacao_id: item.gravacao_id,
      municipio: item.municipio,
      radio_nome: item.radio_nome,
      arquivo: item.arquivo,
      trechos,
      segmentos: trechos.length,
      inicio_segundos: inicio,
      fim_segundos: fim,
    };
  });
}

export interface TranscricaoBuscaResultado {
  id: number;
  gravacao_id: number;
  inicio_segundos: number;
  fim_segundos: number;
  texto: string;
  municipio: string;
  radio_nome: string;
  arquivo: string;
  gravado_em: string;
  em_gravacao: boolean;
}

/**
 * Variantes do termo para ILIKE:
 * - original (ex.: "música") — bate no texto com acento
 * - sem acento (ex.: "musica") — Whisper costuma gravar assim
 * Evita translate() na coluna (lento e falha com unicode NFD).
 */
function termoBuscaSql(termo: string): {
  params: string[];
  filtro: (alias: string) => string;
} {
  const trimmed = termo.normalize("NFC").trim();
  const normalizado = normalizeText(trimmed);
  const lower = trimmed.toLowerCase().replace(/\s+/g, " ");

  const vistos = new Set<string>();
  const variantes: string[] = [];
  for (const valor of [trimmed, lower, normalizado]) {
    if (!valor || vistos.has(valor)) continue;
    vistos.add(valor);
    variantes.push(valor);
  }

  const params = variantes.map((v) => `%${v}%`);
  const filtro = (alias: string) =>
    `(${params.map((_, i) => `${alias}.texto ILIKE $${i + 1}`).join(" OR ")})`;

  return { params, filtro };
}

async function comTimeoutBusca<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    // SET LOCAL só vale dentro de transação.
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '12s'");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function contarBuscaNasTranscricoes(termo: string): Promise<number> {
  const { total } = await buscarNasTranscricoesComTotal({ termo, limite: 1, offset: 0 });
  return total;
}

export async function buscarNasTranscricoes(params: {
  termo: string;
  limite?: number;
  offset?: number;
}): Promise<TranscricaoBuscaResultado[]> {
  const { resultados } = await buscarNasTranscricoesComTotal(params);
  return resultados;
}

/** Uma única query: resultados + total (evita COUNT separado em tabela grande). */
export async function buscarNasTranscricoesComTotal(params: {
  termo: string;
  limite?: number;
  offset?: number;
}): Promise<{ resultados: TranscricaoBuscaResultado[]; total: number }> {
  if (!isDatabaseConfigured() || !params.termo.trim()) {
    return { resultados: [], total: 0 };
  }

  const limite = Math.min(Math.max(params.limite ?? 30, 1), 200);
  const offset = Math.max(params.offset ?? 0, 0);
  const busca = termoBuscaSql(params.termo);
  const limiteIdx = busca.params.length + 1;
  const offsetIdx = busca.params.length + 2;

  return comTimeoutBusca(async (client) => {
    const result = await client.query<
      TranscricaoBuscaResultado & { gravado_em: Date; em_gravacao: boolean; total: string }
    >(
      `SELECT
         s.id,
         s.gravacao_id,
         s.inicio_segundos,
         s.fim_segundos,
         s.texto,
         g.municipio,
         g.radio_nome,
         g.arquivo,
         g.gravado_em,
         g.em_gravacao,
         COUNT(*) OVER()::text AS total
       FROM transcricao_segmentos s
       JOIN gravacao_arquivos g ON g.id = s.gravacao_id
       WHERE g.removido_em IS NULL
         AND ${busca.filtro("s")}
       ORDER BY g.gravado_em DESC, s.inicio_segundos ASC
       LIMIT $${limiteIdx} OFFSET $${offsetIdx}`,
      [...busca.params, limite, offset],
    );

    const total = Number(result.rows[0]?.total ?? 0);
    const resultados = result.rows.map((row) => ({
      id: row.id,
      gravacao_id: row.gravacao_id,
      inicio_segundos: Number(row.inicio_segundos),
      fim_segundos: Number(row.fim_segundos),
      texto: row.texto,
      municipio: row.municipio,
      radio_nome: row.radio_nome,
      arquivo: row.arquivo,
      gravado_em: new Date(row.gravado_em).toISOString(),
      em_gravacao: Boolean(row.em_gravacao),
    }));

    return { resultados, total };
  });
}
