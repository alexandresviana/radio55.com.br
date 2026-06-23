import { getPool, isDatabaseConfigured, withClient } from "@/lib/db";
import { validateAndRepairMp3 } from "@/lib/mp3-integrity";

export interface GravacaoArquivo {
  id: number;
  municipio: string;
  radio_nome: string;
  arquivo: string;
  caminho: string;
  gravado_em: string;
  tamanho_bytes: number;
  em_gravacao: boolean;
  arquivo_valido: boolean | null;
  arquivo_erro: string | null;
  bunny_path: string | null;
  bunny_uploaded_em: string | null;
}

function mapGravacaoRow(
  row: GravacaoArquivo & { bunny_uploaded_em?: Date | string | null },
): GravacaoArquivo {
  return {
    ...row,
    gravado_em: new Date(row.gravado_em).toISOString(),
    tamanho_bytes: Number(row.tamanho_bytes),
    em_gravacao: Boolean(row.em_gravacao),
    arquivo_valido: row.arquivo_valido == null ? null : Boolean(row.arquivo_valido),
    arquivo_erro: row.arquivo_erro ?? null,
    bunny_path: row.bunny_path ?? null,
    bunny_uploaded_em: row.bunny_uploaded_em
      ? new Date(row.bunny_uploaded_em).toISOString()
      : null,
  };
}

export interface BuscaGravacoesParams {
  municipio?: string;
  radio?: string;
  dia?: string;
  horaDe?: string;
  horaAte?: string;
  limite?: number;
  offset?: number;
}

function filtrosGravacoesSql(params: BuscaGravacoesParams) {
  return [
    params.municipio ?? null,
    params.radio ?? null,
    params.dia ?? null,
    params.horaDe ?? null,
    params.horaAte ?? null,
  ];
}

export async function contarGravacoes(params: BuscaGravacoesParams): Promise<number> {
  if (!isDatabaseConfigured()) return 0;

  const result = await getPool().query<{ total: string }>(
    `SELECT COUNT(*)::text AS total
     FROM gravacao_arquivos
     WHERE removido_em IS NULL
       AND ($1::text IS NULL OR municipio = $1)
       AND ($2::text IS NULL OR radio_nome = $2)
       AND ($3::date IS NULL OR gravado_em::date = $3::date)
       AND ($4::time IS NULL OR gravado_em::time >= $4::time)
       AND ($5::time IS NULL OR gravado_em::time <= $5::time)`,
    filtrosGravacoesSql(params),
  );

  return Number(result.rows[0]?.total ?? 0);
}

export async function registrarGravacao(input: {
  municipio: string;
  radioNome: string;
  arquivo: string;
  caminho: string;
  gravadoEm: Date;
  tamanhoBytes: number;
  emGravacao: boolean;
}): Promise<void> {
  if (!isDatabaseConfigured()) return;

  await getPool().query(
    `INSERT INTO gravacao_arquivos (municipio, radio_nome, arquivo, caminho, gravado_em, tamanho_bytes, em_gravacao)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (caminho) DO UPDATE SET
       tamanho_bytes = EXCLUDED.tamanho_bytes,
       em_gravacao = EXCLUDED.em_gravacao,
       removido_em = NULL`,
    [
      input.municipio,
      input.radioNome,
      input.arquivo,
      input.caminho,
      input.gravadoEm.toISOString(),
      input.tamanhoBytes,
      input.emGravacao,
    ],
  );
}

export async function finalizarGravacao(caminho: string): Promise<void> {
  if (!isDatabaseConfigured()) return;

  const validacao = await validateAndRepairMp3(caminho);

  await getPool().query(
    `UPDATE gravacao_arquivos
     SET em_gravacao = FALSE,
         tamanho_bytes = $2,
         arquivo_valido = $3,
         arquivo_erro = $4
     WHERE caminho = $1 AND removido_em IS NULL`,
    [
      caminho,
      validacao.sizeBytes,
      validacao.ok,
      validacao.error,
    ],
  );
}

export async function marcarGravacaoRemovida(caminho: string): Promise<void> {
  if (!isDatabaseConfigured()) return;

  await getPool().query(
    `UPDATE gravacao_arquivos
     SET removido_em = NOW(), em_gravacao = FALSE
     WHERE caminho = $1 AND removido_em IS NULL`,
    [caminho],
  );
}

export async function buscarGravacoes(
  params: BuscaGravacoesParams,
): Promise<GravacaoArquivo[]> {
  if (!isDatabaseConfigured()) return [];

  const limite = Math.min(Math.max(params.limite ?? 50, 1), 200);
  const offset = Math.max(params.offset ?? 0, 0);

  const result = await getPool().query<GravacaoArquivo>(
    `SELECT id, municipio, radio_nome, arquivo, caminho, gravado_em, tamanho_bytes, em_gravacao,
            arquivo_valido, arquivo_erro, bunny_path, bunny_uploaded_em
     FROM gravacao_arquivos
     WHERE removido_em IS NULL
       AND ($1::text IS NULL OR municipio = $1)
       AND ($2::text IS NULL OR radio_nome = $2)
       AND ($3::date IS NULL OR gravado_em::date = $3::date)
       AND ($4::time IS NULL OR gravado_em::time >= $4::time)
       AND ($5::time IS NULL OR gravado_em::time <= $5::time)
     ORDER BY em_gravacao DESC, gravado_em DESC
     LIMIT $6 OFFSET $7`,
    [...filtrosGravacoesSql(params), limite, offset],
  );

  return result.rows.map(mapGravacaoRow);
}

export async function obterGravacaoPorCaminho(
  caminho: string,
): Promise<GravacaoArquivo | null> {
  if (!isDatabaseConfigured()) return null;

  const result = await getPool().query<GravacaoArquivo>(
    `SELECT id, municipio, radio_nome, arquivo, caminho, gravado_em, tamanho_bytes, em_gravacao,
            arquivo_valido, arquivo_erro, bunny_path, bunny_uploaded_em
     FROM gravacao_arquivos
     WHERE caminho = $1 AND removido_em IS NULL`,
    [caminho],
  );

  const row = result.rows[0];
  if (!row) return null;

  return mapGravacaoRow(row);
}

export async function obterGravacaoPorId(id: number): Promise<GravacaoArquivo | null> {
  if (!isDatabaseConfigured()) return null;

  const result = await getPool().query<GravacaoArquivo>(
    `SELECT id, municipio, radio_nome, arquivo, caminho, gravado_em, tamanho_bytes, em_gravacao,
            arquivo_valido, arquivo_erro, bunny_path, bunny_uploaded_em
     FROM gravacao_arquivos
     WHERE id = $1 AND removido_em IS NULL`,
    [id],
  );

  const row = result.rows[0];
  if (!row) return null;

  return mapGravacaoRow(row);
}

export interface GravacaoPendenteUpload {
  id: number;
  municipio: string;
  radio_nome: string;
  arquivo: string;
  caminho: string;
  tamanho_bytes: number;
  em_gravacao: boolean;
}

export async function listarGravacoesPendentesUpload(
  limite = 10,
): Promise<GravacaoPendenteUpload[]> {
  if (!isDatabaseConfigured()) return [];

  const safeLimite = Math.min(Math.max(limite, 1), 50);
  const result = await getPool().query<GravacaoPendenteUpload>(
    `SELECT id, municipio, radio_nome, arquivo, caminho, tamanho_bytes, em_gravacao
     FROM gravacao_arquivos
     WHERE removido_em IS NULL
       AND bunny_uploaded_em IS NULL
       AND em_gravacao = FALSE
       AND tamanho_bytes >= 65536
       AND COALESCE(arquivo_valido, TRUE) = TRUE
     ORDER BY em_gravacao ASC, gravado_em DESC
     LIMIT $1`,
    [safeLimite],
  );

  return result.rows.map((row) => ({
    ...row,
    tamanho_bytes: Number(row.tamanho_bytes),
    em_gravacao: Boolean(row.em_gravacao),
  }));
}

export async function marcarGravacaoEnviadaStorage(
  id: number,
  bunnyPath: string,
  sizeBytes?: number,
): Promise<void> {
  if (!isDatabaseConfigured()) return;

  await getPool().query(
    `UPDATE gravacao_arquivos
     SET bunny_path = $2,
         bunny_uploaded_em = NOW(),
         bunny_upload_bytes = COALESCE($3, tamanho_bytes)
     WHERE id = $1`,
    [id, bunnyPath, sizeBytes ?? null],
  );
}

export async function listarRadiosGravadas(): Promise<
  { municipio: string; radio_nome: string }[]
> {
  if (!isDatabaseConfigured()) return [];

  const result = await withClient(async (client) => {
    return client.query<{ municipio: string; radio_nome: string }>(
      `SELECT DISTINCT municipio, radio_nome
       FROM gravacao_arquivos
       WHERE removido_em IS NULL
       ORDER BY municipio, radio_nome`,
    );
  });

  return result.rows;
}
