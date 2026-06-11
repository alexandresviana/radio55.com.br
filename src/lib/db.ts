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
        em_gravacao BOOLEAN NOT NULL DEFAULT FALSE,
        removido_em TIMESTAMPTZ,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE gravacao_arquivos
        ADD COLUMN IF NOT EXISTS em_gravacao BOOLEAN NOT NULL DEFAULT FALSE;

      CREATE INDEX IF NOT EXISTS idx_gravacao_arquivos_gravado_em
        ON gravacao_arquivos (gravado_em DESC);

      CREATE INDEX IF NOT EXISTS idx_gravacao_arquivos_radio
        ON gravacao_arquivos (municipio, radio_nome);

      CREATE INDEX IF NOT EXISTS idx_gravacao_arquivos_ativos
        ON gravacao_arquivos (removido_em)
        WHERE removido_em IS NULL;

      CREATE TABLE IF NOT EXISTS palavras_chave (
        id SERIAL PRIMARY KEY,
        termo TEXT NOT NULL UNIQUE,
        ativo BOOLEAN NOT NULL DEFAULT TRUE,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS transcricao_progresso (
        caminho TEXT PRIMARY KEY,
        gravacao_id INTEGER REFERENCES gravacao_arquivos(id) ON DELETE CASCADE,
        ultimo_segundo NUMERIC NOT NULL DEFAULT 0,
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS palavra_deteccoes (
        id SERIAL PRIMARY KEY,
        palavra_chave_id INTEGER REFERENCES palavras_chave(id) ON DELETE SET NULL,
        gravacao_id INTEGER REFERENCES gravacao_arquivos(id) ON DELETE CASCADE,
        termo TEXT NOT NULL,
        inicio_segundos NUMERIC NOT NULL,
        fim_segundos NUMERIC NOT NULL,
        contexto TEXT NOT NULL DEFAULT '',
        trecho_caminho TEXT,
        detectado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_palavra_deteccoes_detectado_em
        ON palavra_deteccoes (detectado_em DESC);

      CREATE INDEX IF NOT EXISTS idx_palavra_deteccoes_gravacao
        ON palavra_deteccoes (gravacao_id, inicio_segundos);

      CREATE TABLE IF NOT EXISTS transcricao_segmentos (
        id SERIAL PRIMARY KEY,
        gravacao_id INTEGER NOT NULL REFERENCES gravacao_arquivos(id) ON DELETE CASCADE,
        inicio_segundos NUMERIC NOT NULL,
        fim_segundos NUMERIC NOT NULL,
        texto TEXT NOT NULL,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_transcricao_segmentos_gravacao
        ON transcricao_segmentos (gravacao_id, inicio_segundos);

      CREATE TABLE IF NOT EXISTS youtube_canais (
        id SERIAL PRIMARY KEY,
        channel_id TEXT NOT NULL UNIQUE,
        titulo TEXT NOT NULL DEFAULT '',
        url_entrada TEXT NOT NULL DEFAULT '',
        ativo BOOLEAN NOT NULL DEFAULT TRUE,
        ultima_verificacao_em TIMESTAMPTZ,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_youtube_canais_ativo
        ON youtube_canais (ativo)
        WHERE ativo = TRUE;

      CREATE TABLE IF NOT EXISTS youtube_videos (
        id SERIAL PRIMARY KEY,
        canal_id INTEGER NOT NULL REFERENCES youtube_canais(id) ON DELETE CASCADE,
        video_id TEXT NOT NULL UNIQUE,
        titulo TEXT NOT NULL DEFAULT '',
        publicado_em TIMESTAMPTZ,
        status TEXT NOT NULL DEFAULT 'pendente',
        erro_msg TEXT,
        tentativas INTEGER NOT NULL DEFAULT 0,
        processado_em TIMESTAMPTZ,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE youtube_videos
        ADD COLUMN IF NOT EXISTS tentativas INTEGER NOT NULL DEFAULT 0;

      CREATE INDEX IF NOT EXISTS idx_youtube_videos_status
        ON youtube_videos (status, criado_em);

      CREATE INDEX IF NOT EXISTS idx_youtube_videos_canal
        ON youtube_videos (canal_id, publicado_em DESC);

      CREATE TABLE IF NOT EXISTS youtube_transcricao_segmentos (
        id SERIAL PRIMARY KEY,
        video_db_id INTEGER NOT NULL REFERENCES youtube_videos(id) ON DELETE CASCADE,
        inicio_segundos NUMERIC NOT NULL,
        fim_segundos NUMERIC NOT NULL,
        texto TEXT NOT NULL,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_youtube_transcricao_video
        ON youtube_transcricao_segmentos (video_db_id, inicio_segundos);

      CREATE TABLE IF NOT EXISTS youtube_palavra_deteccoes (
        id SERIAL PRIMARY KEY,
        palavra_chave_id INTEGER REFERENCES palavras_chave(id) ON DELETE SET NULL,
        video_db_id INTEGER NOT NULL REFERENCES youtube_videos(id) ON DELETE CASCADE,
        termo TEXT NOT NULL,
        inicio_segundos NUMERIC NOT NULL,
        fim_segundos NUMERIC NOT NULL,
        contexto TEXT NOT NULL DEFAULT '',
        detectado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_youtube_deteccoes_detectado_em
        ON youtube_palavra_deteccoes (detectado_em DESC);

      CREATE TABLE IF NOT EXISTS emissoras_config (
        id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        dados JSONB NOT NULL,
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE gravacao_arquivos
        ADD COLUMN IF NOT EXISTS bunny_path TEXT;

      ALTER TABLE gravacao_arquivos
        ADD COLUMN IF NOT EXISTS bunny_uploaded_em TIMESTAMPTZ;

      ALTER TABLE gravacao_arquivos
        ADD COLUMN IF NOT EXISTS bunny_upload_bytes BIGINT;

      CREATE INDEX IF NOT EXISTS idx_gravacao_arquivos_bunny_pendente
        ON gravacao_arquivos (gravado_em DESC)
        WHERE removido_em IS NULL AND bunny_uploaded_em IS NULL;

    `);
  });
}
