import { Pool, type PoolClient } from "pg";

type DbGlobal = typeof globalThis & {
  __radio55Pool?: Pool;
};

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function getPool(): Pool {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL não configurado");
  }

  const globalRef = globalThis as DbGlobal;
  if (!globalRef.__radio55Pool) {
    globalRef.__radio55Pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
    });
  }

  return globalRef.__radio55Pool;
}

export async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function initDatabase(): Promise<void> {
  if (!isDatabaseConfigured()) {
    console.warn("[db] DATABASE_URL ausente — índice de gravações desativado");
    return;
  }

  await withClient(async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS gravacao_arquivos (
        id SERIAL PRIMARY KEY,
        municipio TEXT NOT NULL,
        radio_nome TEXT NOT NULL,
        arquivo TEXT NOT NULL,
        caminho TEXT NOT NULL UNIQUE,
        gravado_em TIMESTAMPTZ NOT NULL,
        tamanho_bytes BIGINT NOT NULL DEFAULT 0,
        removido_em TIMESTAMPTZ,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_gravacao_arquivos_gravado_em
        ON gravacao_arquivos (gravado_em DESC);

      CREATE INDEX IF NOT EXISTS idx_gravacao_arquivos_radio
        ON gravacao_arquivos (municipio, radio_nome);

      CREATE INDEX IF NOT EXISTS idx_gravacao_arquivos_ativos
        ON gravacao_arquivos (removido_em)
        WHERE removido_em IS NULL;
    `);
  });
}
