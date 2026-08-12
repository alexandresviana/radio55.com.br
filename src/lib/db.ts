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
      max: 20,
      // Falha rápido em vez de pendurar a request até o proxy devolver 504.
      connectionTimeoutMillis: 10_000,
      statement_timeout: 30_000,
      query_timeout: 35_000,
      // Menos churn de conexões: reconectar a cada 10s multiplicava handshakes,
      // que estouram quando o Whisper consome a CPU do container.
      idleTimeoutMillis: 60_000,
      keepAlive: true,
    });
    globalRef.__radio55Pool.on("error", (err) => {
      console.error("[db] erro no pool:", err.message);
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

export function isPgUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    String((error as { code?: string }).code) === "23505"
  );
}

/** Corrige SERIAL dessincronizado após restore/migração (evita duplicate pkey). */
async function sincronizarSequences(client: PoolClient): Promise<void> {
  const tabelas = [
    "gravacao_arquivos",
    "palavras_chave",
    "palavra_deteccoes",
    "transcricao_segmentos",
    "youtube_canais",
    "youtube_videos",
    "youtube_transcricao_segmentos",
    "youtube_palavra_deteccoes",
    "instagram_perfis",
    "instagram_buscas",
    "instagram_posts",
    "instagram_comentarios",
    "instagram_palavra_deteccoes",
    "x_buscas",
    "x_posts",
    "x_palavra_deteccoes",
    "meta_ads_paginas",
    "meta_ads_buscas",
    "meta_ads",
    "meta_ads_palavra_deteccoes",
  ];

  for (const tabela of tabelas) {
    await client.query(
      `DO $$
       DECLARE seq text;
       BEGIN
         seq := pg_get_serial_sequence('${tabela}', 'id');
         IF seq IS NOT NULL THEN
           -- Tabela vazia: setval(seq, 1, false) faz o próximo id ser 1 (setval 0 é inválido).
           EXECUTE format(
             'SELECT setval(%L, COALESCE((SELECT MAX(id) FROM ${tabela}), 1), (SELECT MAX(id) IS NOT NULL FROM ${tabela}))',
             seq
           );
         END IF;
       END $$`,
    );
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

      ALTER TABLE palavras_chave
        ADD COLUMN IF NOT EXISTS coletar_instagram BOOLEAN NOT NULL DEFAULT FALSE;

      ALTER TABLE palavras_chave
        ADD COLUMN IF NOT EXISTS coletar_x BOOLEAN NOT NULL DEFAULT FALSE;

      ALTER TABLE palavras_chave
        ADD COLUMN IF NOT EXISTS coletar_meta_ads BOOLEAN NOT NULL DEFAULT FALSE;

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

      ALTER TABLE youtube_videos
        ADD COLUMN IF NOT EXISTS duracao_video_segundos NUMERIC;

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

      CREATE TABLE IF NOT EXISTS instagram_perfis (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        titulo TEXT NOT NULL DEFAULT '',
        url_entrada TEXT NOT NULL DEFAULT '',
        ativo BOOLEAN NOT NULL DEFAULT TRUE,
        ultima_verificacao_em TIMESTAMPTZ,
        ultimo_erro TEXT,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_instagram_perfis_ativo
        ON instagram_perfis (ativo)
        WHERE ativo = TRUE;

      CREATE TABLE IF NOT EXISTS instagram_buscas (
        id SERIAL PRIMARY KEY,
        termo TEXT NOT NULL UNIQUE,
        ativo BOOLEAN NOT NULL DEFAULT TRUE,
        ultima_verificacao_em TIMESTAMPTZ,
        ultimo_erro TEXT,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_instagram_buscas_ativo
        ON instagram_buscas (ativo)
        WHERE ativo = TRUE;

      CREATE TABLE IF NOT EXISTS instagram_posts (
        id SERIAL PRIMARY KEY,
        perfil_id INTEGER REFERENCES instagram_perfis(id) ON DELETE CASCADE,
        busca_id INTEGER REFERENCES instagram_buscas(id) ON DELETE CASCADE,
        owner_username TEXT NOT NULL DEFAULT '',
        post_id TEXT NOT NULL UNIQUE,
        short_code TEXT NOT NULL DEFAULT '',
        url TEXT NOT NULL DEFAULT '',
        tipo TEXT NOT NULL DEFAULT '',
        legenda TEXT NOT NULL DEFAULT '',
        publicado_em TIMESTAMPTZ,
        video_url TEXT,
        imagem_url TEXT,
        curtidas INTEGER,
        comentarios INTEGER,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE instagram_posts
        ALTER COLUMN perfil_id DROP NOT NULL;

      ALTER TABLE instagram_posts
        ADD COLUMN IF NOT EXISTS busca_id INTEGER REFERENCES instagram_buscas(id) ON DELETE CASCADE;

      ALTER TABLE instagram_posts
        ADD COLUMN IF NOT EXISTS owner_username TEXT NOT NULL DEFAULT '';

      ALTER TABLE instagram_posts
        ADD COLUMN IF NOT EXISTS comentarios_coletados_em TIMESTAMPTZ;

      CREATE INDEX IF NOT EXISTS idx_instagram_posts_perfil
        ON instagram_posts (perfil_id, publicado_em DESC);

      CREATE INDEX IF NOT EXISTS idx_instagram_posts_busca
        ON instagram_posts (busca_id, publicado_em DESC);

      CREATE TABLE IF NOT EXISTS instagram_comentarios (
        id SERIAL PRIMARY KEY,
        post_db_id INTEGER NOT NULL REFERENCES instagram_posts(id) ON DELETE CASCADE,
        comentario_id TEXT NOT NULL UNIQUE,
        autor_username TEXT NOT NULL DEFAULT '',
        texto TEXT NOT NULL DEFAULT '',
        publicado_em TIMESTAMPTZ,
        curtidas INTEGER,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_instagram_comentarios_post
        ON instagram_comentarios (post_db_id, publicado_em DESC);

      CREATE TABLE IF NOT EXISTS instagram_palavra_deteccoes (
        id SERIAL PRIMARY KEY,
        palavra_chave_id INTEGER REFERENCES palavras_chave(id) ON DELETE SET NULL,
        post_db_id INTEGER NOT NULL REFERENCES instagram_posts(id) ON DELETE CASCADE,
        termo TEXT NOT NULL,
        contexto TEXT NOT NULL DEFAULT '',
        detectado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE instagram_palavra_deteccoes
        ADD COLUMN IF NOT EXISTS comentario_db_id INTEGER REFERENCES instagram_comentarios(id) ON DELETE CASCADE;

      CREATE INDEX IF NOT EXISTS idx_instagram_deteccoes_detectado_em
        ON instagram_palavra_deteccoes (detectado_em DESC);

      CREATE TABLE IF NOT EXISTS x_buscas (
        id SERIAL PRIMARY KEY,
        termo TEXT NOT NULL UNIQUE,
        ativo BOOLEAN NOT NULL DEFAULT TRUE,
        ultima_verificacao_em TIMESTAMPTZ,
        ultimo_erro TEXT,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_x_buscas_ativo
        ON x_buscas (ativo)
        WHERE ativo = TRUE;

      CREATE TABLE IF NOT EXISTS x_posts (
        id SERIAL PRIMARY KEY,
        busca_id INTEGER REFERENCES x_buscas(id) ON DELETE CASCADE,
        autor_username TEXT NOT NULL DEFAULT '',
        autor_nome TEXT NOT NULL DEFAULT '',
        tweet_id TEXT NOT NULL UNIQUE,
        url TEXT NOT NULL DEFAULT '',
        texto TEXT NOT NULL DEFAULT '',
        publicado_em TIMESTAMPTZ,
        imagem_url TEXT,
        curtidas INTEGER,
        retweets INTEGER,
        respostas INTEGER,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_x_posts_busca
        ON x_posts (busca_id, publicado_em DESC);

      CREATE TABLE IF NOT EXISTS x_palavra_deteccoes (
        id SERIAL PRIMARY KEY,
        palavra_chave_id INTEGER REFERENCES palavras_chave(id) ON DELETE SET NULL,
        post_db_id INTEGER NOT NULL REFERENCES x_posts(id) ON DELETE CASCADE,
        termo TEXT NOT NULL,
        contexto TEXT NOT NULL DEFAULT '',
        detectado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_x_deteccoes_detectado_em
        ON x_palavra_deteccoes (detectado_em DESC);

      CREATE TABLE IF NOT EXISTS meta_ads_paginas (
        id SERIAL PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        titulo TEXT NOT NULL DEFAULT '',
        url_entrada TEXT NOT NULL DEFAULT '',
        ativo BOOLEAN NOT NULL DEFAULT TRUE,
        ultima_verificacao_em TIMESTAMPTZ,
        ultimo_erro TEXT,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_meta_ads_paginas_ativo
        ON meta_ads_paginas (ativo)
        WHERE ativo = TRUE;

      CREATE TABLE IF NOT EXISTS meta_ads_buscas (
        id SERIAL PRIMARY KEY,
        termo TEXT NOT NULL UNIQUE,
        ativo BOOLEAN NOT NULL DEFAULT TRUE,
        ultima_verificacao_em TIMESTAMPTZ,
        ultimo_erro TEXT,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_meta_ads_buscas_ativo
        ON meta_ads_buscas (ativo)
        WHERE ativo = TRUE;

      CREATE TABLE IF NOT EXISTS meta_ads (
        id SERIAL PRIMARY KEY,
        busca_id INTEGER REFERENCES meta_ads_buscas(id) ON DELETE SET NULL,
        pagina_id INTEGER REFERENCES meta_ads_paginas(id) ON DELETE SET NULL,
        ad_archive_id TEXT NOT NULL UNIQUE,
        page_id TEXT NOT NULL DEFAULT '',
        page_name TEXT NOT NULL DEFAULT '',
        url TEXT NOT NULL DEFAULT '',
        texto TEXT NOT NULL DEFAULT '',
        titulo TEXT NOT NULL DEFAULT '',
        cta_text TEXT NOT NULL DEFAULT '',
        link_url TEXT,
        imagem_url TEXT,
        video_url TEXT,
        inicio_em TIMESTAMPTZ,
        fim_em TIMESTAMPTZ,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_meta_ads_busca
        ON meta_ads (busca_id, inicio_em DESC);

      CREATE INDEX IF NOT EXISTS idx_meta_ads_pagina
        ON meta_ads (pagina_id, inicio_em DESC);

      CREATE TABLE IF NOT EXISTS meta_ads_palavra_deteccoes (
        id SERIAL PRIMARY KEY,
        palavra_chave_id INTEGER REFERENCES palavras_chave(id) ON DELETE SET NULL,
        ad_db_id INTEGER NOT NULL REFERENCES meta_ads(id) ON DELETE CASCADE,
        termo TEXT NOT NULL,
        contexto TEXT NOT NULL DEFAULT '',
        detectado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_meta_ads_deteccoes_detectado_em
        ON meta_ads_palavra_deteccoes (detectado_em DESC);

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

      ALTER TABLE gravacao_arquivos
        ADD COLUMN IF NOT EXISTS arquivo_valido BOOLEAN;

      ALTER TABLE gravacao_arquivos
        ADD COLUMN IF NOT EXISTS arquivo_erro TEXT;

      CREATE INDEX IF NOT EXISTS idx_gravacao_arquivos_bunny_pendente
        ON gravacao_arquivos (gravado_em DESC)
        WHERE removido_em IS NULL AND bunny_uploaded_em IS NULL;

    `);

    await sincronizarSequences(client);
  });
}

/**
 * Limpa só o monitoramento operacional:
 * - arquivos locais em gravacoes/ e trechos/
 * - uploads no Bunny Storage (quando houver bunny_path)
 * - gravações/transcrições/detecções de rádio no Postgres
 * - canais YouTube monitorados (+ vídeos/transcrições/detecções)
 * - perfis Instagram monitorados (+ publicações/detecções)
 * - termos X monitorados (+ posts/detecções)
 * - anúncios Meta (+ páginas/buscas/detecções)
 *
 * Mantém: emissoras_config, palavras_chave e login (AUTH_*).
 */
export async function limparBaseDados(): Promise<Record<string, number>> {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL não configurado");
  }

  const { limparArquivosMonitoramento } = await import("@/lib/limpar-arquivos-monitoramento");
  const arquivos = await limparArquivosMonitoramento();

  return withClient(async (client) => {
    const tabelas = [
      "youtube_palavra_deteccoes",
      "youtube_transcricao_segmentos",
      "youtube_videos",
      "youtube_canais",
      "instagram_palavra_deteccoes",
      "instagram_comentarios",
      "instagram_posts",
      "instagram_buscas",
      "instagram_perfis",
      "x_palavra_deteccoes",
      "x_posts",
      "x_buscas",
      "meta_ads_palavra_deteccoes",
      "meta_ads",
      "meta_ads_buscas",
      "meta_ads_paginas",
      "palavra_deteccoes",
      "transcricao_segmentos",
      "transcricao_progresso",
      "gravacao_arquivos",
    ];

    const contagens: Record<string, number> = {
      arquivos_gravacoes_locais: arquivos.gravacoesLocais,
      arquivos_trechos_locais: arquivos.trechosLocais,
      arquivos_bunny_remotos: arquivos.bunnyRemotos,
      arquivos_bunny_falhas: arquivos.bunnyFalhas,
    };

    await client.query("BEGIN");
    try {
      for (const tabela of tabelas) {
        const before = await client.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM ${tabela}`);
        contagens[tabela] = Number(before.rows[0]?.n ?? 0);
        await client.query(`TRUNCATE TABLE ${tabela} RESTART IDENTITY CASCADE`);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    await sincronizarSequences(client);
    console.warn("[db] Monitoramento limpo — tabelas truncadas:", contagens);
    return contagens;
  });
}
