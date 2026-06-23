import { getPool, isDatabaseConfigured } from "@/lib/db";

export interface PalavraDeteccao {
  id: number;
  palavra_chave_id: number | null;
  gravacao_id: number;
  termo: string;
  inicio_segundos: number;
  fim_segundos: number;
  contexto: string;
  trecho_caminho: string | null;
  detectado_em: string;
  municipio: string;
  radio_nome: string;
  arquivo: string;
  em_gravacao: boolean;
}

export interface BuscaDeteccoesParams {
  municipio?: string;
  radio?: string;
  termo?: string;
  aoVivo?: boolean;
  limite?: number;
  offset?: number;
}

function filtrosDeteccoesSql(params: BuscaDeteccoesParams) {
  return [
    params.municipio ?? null,
    params.radio ?? null,
    params.termo ? `%${params.termo}%` : null,
    params.aoVivo ?? null,
  ];
}

export async function contarDeteccoes(params: BuscaDeteccoesParams): Promise<number> {
  if (!isDatabaseConfigured()) return 0;

  const result = await getPool().query<{ total: string }>(
    `SELECT COUNT(*)::text AS total
     FROM palavra_deteccoes d
     JOIN gravacao_arquivos g ON g.id = d.gravacao_id
     WHERE g.removido_em IS NULL
       AND ($1::text IS NULL OR g.municipio = $1)
       AND ($2::text IS NULL OR g.radio_nome = $2)
       AND ($3::text IS NULL OR d.termo ILIKE $3)
       AND ($4::boolean IS NULL OR g.em_gravacao = $4)`,
    filtrosDeteccoesSql(params),
  );

  return Number(result.rows[0]?.total ?? 0);
}

export async function registrarDeteccao(input: {
  palavraChaveId: number | null;
  gravacaoId: number;
  termo: string;
  inicioSegundos: number;
  fimSegundos: number;
  contexto: string;
  trechoCaminho?: string | null;
}): Promise<PalavraDeteccao | null> {
  if (!isDatabaseConfigured()) return null;

  const duplicata = await getPool().query<{ id: number }>(
    `SELECT id
     FROM palavra_deteccoes
     WHERE gravacao_id = $1
       AND termo = $2
       AND ABS(inicio_segundos - $3) < 2
     LIMIT 1`,
    [input.gravacaoId, input.termo, input.inicioSegundos],
  );

  if (duplicata.rows[0]) {
    return obterDeteccaoPorId(duplicata.rows[0].id);
  }

  const result = await getPool().query<{ id: number }>(
    `INSERT INTO palavra_deteccoes (
       palavra_chave_id, gravacao_id, termo, inicio_segundos, fim_segundos, contexto, trecho_caminho
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      input.palavraChaveId,
      input.gravacaoId,
      input.termo,
      input.inicioSegundos,
      input.fimSegundos,
      input.contexto,
      input.trechoCaminho ?? null,
    ],
  );

  const id = result.rows[0]?.id;
  if (!id) return null;

  return obterDeteccaoPorId(id);
}

export async function obterDeteccaoPorId(id: number): Promise<PalavraDeteccao | null> {
  if (!isDatabaseConfigured()) return null;

  const result = await getPool().query<PalavraDeteccao>(
    `SELECT
       d.id,
       d.palavra_chave_id,
       d.gravacao_id,
       d.termo,
       d.inicio_segundos,
       d.fim_segundos,
       d.contexto,
       d.trecho_caminho,
       d.detectado_em,
       g.municipio,
       g.radio_nome,
       g.arquivo,
       g.em_gravacao
     FROM palavra_deteccoes d
     JOIN gravacao_arquivos g ON g.id = d.gravacao_id
     WHERE d.id = $1 AND g.removido_em IS NULL`,
    [id],
  );

  const row = result.rows[0];
  if (!row) return null;

  return mapDeteccao(row);
}

export async function buscarDeteccoes(
  params: BuscaDeteccoesParams,
): Promise<PalavraDeteccao[]> {
  if (!isDatabaseConfigured()) return [];

  const limite = Math.min(Math.max(params.limite ?? 50, 1), 200);
  const offset = Math.max(params.offset ?? 0, 0);

  const result = await getPool().query<PalavraDeteccao>(
    `SELECT
       d.id,
       d.palavra_chave_id,
       d.gravacao_id,
       d.termo,
       d.inicio_segundos,
       d.fim_segundos,
       d.contexto,
       d.trecho_caminho,
       d.detectado_em,
       g.municipio,
       g.radio_nome,
       g.arquivo,
       g.em_gravacao
     FROM palavra_deteccoes d
     JOIN gravacao_arquivos g ON g.id = d.gravacao_id
     WHERE g.removido_em IS NULL
       AND ($1::text IS NULL OR g.municipio = $1)
       AND ($2::text IS NULL OR g.radio_nome = $2)
       AND ($3::text IS NULL OR d.termo ILIKE $3)
       AND ($4::boolean IS NULL OR g.em_gravacao = $4)
     ORDER BY d.detectado_em DESC
     LIMIT $5 OFFSET $6`,
    [...filtrosDeteccoesSql(params), limite, offset],
  );

  return result.rows.map(mapDeteccao);
}

export async function atualizarTrechoDeteccao(
  id: number,
  trechoCaminho: string,
): Promise<void> {
  if (!isDatabaseConfigured()) return;

  await getPool().query(
    `UPDATE palavra_deteccoes SET trecho_caminho = $2 WHERE id = $1`,
    [id, trechoCaminho],
  );
}

export async function limparTrechoCaminho(id: number): Promise<void> {
  if (!isDatabaseConfigured()) return;

  await getPool().query(
    `UPDATE palavra_deteccoes SET trecho_caminho = NULL WHERE id = $1`,
    [id],
  );
}

export async function listarDeteccoesComTrecho(): Promise<
  { id: number; trecho_caminho: string }[]
> {
  if (!isDatabaseConfigured()) return [];

  const result = await getPool().query<{ id: number; trecho_caminho: string }>(
    `SELECT id, trecho_caminho
     FROM palavra_deteccoes
     WHERE trecho_caminho IS NOT NULL`,
  );

  return result.rows;
}

export async function obterProgressoTranscricao(
  caminho: string,
): Promise<{ ultimo_segundo: number; gravacao_id: number | null } | null> {
  if (!isDatabaseConfigured()) return null;

  const result = await getPool().query<{
    ultimo_segundo: string;
    gravacao_id: number | null;
  }>(
    `SELECT ultimo_segundo, gravacao_id
     FROM transcricao_progresso
     WHERE caminho = $1`,
    [caminho],
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    ultimo_segundo: Number(row.ultimo_segundo),
    gravacao_id: row.gravacao_id,
  };
}

export async function salvarProgressoTranscricao(input: {
  caminho: string;
  gravacaoId: number | null;
  ultimoSegundo: number;
}): Promise<void> {
  if (!isDatabaseConfigured()) return;

  await getPool().query(
    `INSERT INTO transcricao_progresso (caminho, gravacao_id, ultimo_segundo, atualizado_em)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (caminho) DO UPDATE SET
       gravacao_id = EXCLUDED.gravacao_id,
       ultimo_segundo = EXCLUDED.ultimo_segundo,
       atualizado_em = NOW()`,
    [input.caminho, input.gravacaoId, input.ultimoSegundo],
  );
}

function mapDeteccao(row: PalavraDeteccao): PalavraDeteccao {
  return {
    ...row,
    inicio_segundos: Number(row.inicio_segundos),
    fim_segundos: Number(row.fim_segundos),
    detectado_em: new Date(row.detectado_em).toISOString(),
    em_gravacao: Boolean(row.em_gravacao),
  };
}
