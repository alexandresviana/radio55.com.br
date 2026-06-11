import { getPool, isDatabaseConfigured } from "@/lib/db";
import { formatMinutagem } from "@/lib/text-normalize";

const PREVIEW_JANELA_SEGUNDOS = 30 * 60;
const PREVIEW_MAX_CARACTERES = 4_000;

export interface TranscricaoSegmento {
  inicio_segundos: number;
  texto: string;
}

export interface TranscricaoPreview {
  gravacao_id: number;
  municipio: string;
  radio_nome: string;
  arquivo: string;
  preview: string;
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
    const texto = segmento.texto.trim();
    if (!texto) continue;

    await getPool().query(
      `INSERT INTO transcricao_segmentos (gravacao_id, inicio_segundos, fim_segundos, texto)
       VALUES ($1, $2, $3, $4)`,
      [gravacaoId, segmento.inicioSegundos, segmento.fimSegundos, texto],
    );
  }

  await limparSegmentosAntigos(gravacaoId, PREVIEW_JANELA_SEGUNDOS);
}

async function limparSegmentosAntigos(
  gravacaoId: number,
  janelaSegundos: number,
): Promise<void> {
  await getPool().query(
    `DELETE FROM transcricao_segmentos
     WHERE gravacao_id = $1
       AND inicio_segundos < (
         SELECT COALESCE(MAX(inicio_segundos), 0) - $2
         FROM transcricao_segmentos
         WHERE gravacao_id = $1
       )`,
    [gravacaoId, janelaSegundos],
  );
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
    inicio_segundos: string;
    texto: string;
  }>(
    `SELECT
       g.id AS gravacao_id,
       g.municipio,
       g.radio_nome,
       g.arquivo,
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
      segmentos: TranscricaoSegmento[];
    }
  >();

  for (const row of result.rows) {
    const atual = porGravacao.get(row.gravacao_id) ?? {
      gravacao_id: row.gravacao_id,
      municipio: row.municipio,
      radio_nome: row.radio_nome,
      arquivo: row.arquivo,
      segmentos: [],
    };

    atual.segmentos.push({
      inicio_segundos: Number(row.inicio_segundos),
      texto: row.texto,
    });
    porGravacao.set(row.gravacao_id, atual);
  }

  return [...porGravacao.values()].map((item) => {
    const linhas = item.segmentos.map(
      (seg) => `[${formatMinutagem(seg.inicio_segundos)}] ${seg.texto}`,
    );
    let preview = linhas.join("\n");
    if (preview.length > PREVIEW_MAX_CARACTERES) {
      preview = `…${preview.slice(-PREVIEW_MAX_CARACTERES)}`;
    }

    const inicio = item.segmentos[0]?.inicio_segundos ?? null;
    const fim = item.segmentos.at(-1)?.inicio_segundos ?? null;

    return {
      gravacao_id: item.gravacao_id,
      municipio: item.municipio,
      radio_nome: item.radio_nome,
      arquivo: item.arquivo,
      preview,
      segmentos: item.segmentos.length,
      inicio_segundos: inicio,
      fim_segundos: fim,
    };
  });
}
