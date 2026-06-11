import { getPool, isDatabaseConfigured } from "@/lib/db";
import { formatHorarioGravacao } from "@/lib/text-normalize";

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
