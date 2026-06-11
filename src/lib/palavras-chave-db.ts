import { getPool, isDatabaseConfigured } from "@/lib/db";

export interface PalavraChave {
  id: number;
  termo: string;
  ativo: boolean;
  criado_em: string;
}

export async function listarPalavrasChave(): Promise<PalavraChave[]> {
  if (!isDatabaseConfigured()) return [];

  const result = await getPool().query<PalavraChave>(
    `SELECT id, termo, ativo, criado_em
     FROM palavras_chave
     ORDER BY termo ASC`,
  );

  return result.rows.map((row) => ({
    ...row,
    ativo: Boolean(row.ativo),
    criado_em: new Date(row.criado_em).toISOString(),
  }));
}

export async function listarPalavrasChaveAtivas(): Promise<PalavraChave[]> {
  if (!isDatabaseConfigured()) return [];

  const result = await getPool().query<PalavraChave>(
    `SELECT id, termo, ativo, criado_em
     FROM palavras_chave
     WHERE ativo = TRUE
     ORDER BY termo ASC`,
  );

  return result.rows.map((row) => ({
    ...row,
    ativo: Boolean(row.ativo),
    criado_em: new Date(row.criado_em).toISOString(),
  }));
}

export async function criarPalavraChave(termo: string): Promise<PalavraChave> {
  const normalizado = termo.trim();
  if (!normalizado) {
    throw new Error("Termo vazio");
  }

  const result = await getPool().query<PalavraChave>(
    `INSERT INTO palavras_chave (termo)
     VALUES ($1)
     ON CONFLICT (termo) DO UPDATE SET ativo = TRUE
     RETURNING id, termo, ativo, criado_em`,
    [normalizado],
  );

  const row = result.rows[0];
  return {
    ...row,
    ativo: Boolean(row.ativo),
    criado_em: new Date(row.criado_em).toISOString(),
  };
}

export async function removerPalavraChave(id: number): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;

  const result = await getPool().query(
    `DELETE FROM palavras_chave WHERE id = $1`,
    [id],
  );

  return (result.rowCount ?? 0) > 0;
}

export async function alternarPalavraChave(
  id: number,
  ativo: boolean,
): Promise<PalavraChave | null> {
  const result = await getPool().query<PalavraChave>(
    `UPDATE palavras_chave
     SET ativo = $2
     WHERE id = $1
     RETURNING id, termo, ativo, criado_em`,
    [id, ativo],
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    ...row,
    ativo: Boolean(row.ativo),
    criado_em: new Date(row.criado_em).toISOString(),
  };
}
