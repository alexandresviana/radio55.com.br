import { getPool, isDatabaseConfigured } from "@/lib/db";

export interface PalavraChave {
  id: number;
  termo: string;
  ativo: boolean;
  coletar_instagram: boolean;
  coletar_x: boolean;
  coletar_meta_ads: boolean;
  criado_em: string;
}

export interface PalavraChaveInput {
  termo: string;
  coletarInstagram?: boolean;
  coletarX?: boolean;
  coletarMetaAds?: boolean;
}

function mapPalavra(row: {
  id: number;
  termo: string;
  ativo: boolean;
  coletar_instagram?: boolean;
  coletar_x?: boolean;
  coletar_meta_ads?: boolean;
  criado_em: string | Date;
}): PalavraChave {
  return {
    id: row.id,
    termo: row.termo,
    ativo: Boolean(row.ativo),
    coletar_instagram: Boolean(row.coletar_instagram),
    coletar_x: Boolean(row.coletar_x),
    coletar_meta_ads: Boolean(row.coletar_meta_ads),
    criado_em: new Date(row.criado_em).toISOString(),
  };
}

/** Importa termos já cadastrados nas buscas IG/X/Meta para a lista central. */
export async function importarBuscasComoPalavras(): Promise<void> {
  if (!isDatabaseConfigured()) return;

  await getPool().query(
    `UPDATE palavras_chave p
     SET termo = lower(trim(p.termo))
     WHERE p.termo <> lower(trim(p.termo))
       AND NOT EXISTS (
         SELECT 1 FROM palavras_chave o
         WHERE o.id <> p.id AND o.termo = lower(trim(p.termo))
       )`,
  );

  await getPool().query(
    `INSERT INTO palavras_chave (termo, ativo, coletar_instagram)
     SELECT lower(b.termo), b.ativo, TRUE
     FROM instagram_buscas b
     ON CONFLICT (termo) DO UPDATE SET
       coletar_instagram = TRUE,
       ativo = palavras_chave.ativo OR EXCLUDED.ativo`,
  );

  await getPool().query(
    `INSERT INTO palavras_chave (termo, ativo, coletar_x)
     SELECT lower(b.termo), b.ativo, TRUE
     FROM x_buscas b
     ON CONFLICT (termo) DO UPDATE SET
       coletar_x = TRUE,
       ativo = palavras_chave.ativo OR EXCLUDED.ativo`,
  );

  await getPool().query(
    `INSERT INTO palavras_chave (termo, ativo, coletar_meta_ads)
     SELECT lower(b.termo), b.ativo, TRUE
     FROM meta_ads_buscas b
     ON CONFLICT (termo) DO UPDATE SET
       coletar_meta_ads = TRUE,
       ativo = palavras_chave.ativo OR EXCLUDED.ativo`,
  );
}

/** Espelha flags de coleta da palavra nas tabelas de busca IG/X/Meta. */
export async function sincronizarColetaPalavra(palavra: PalavraChave): Promise<void> {
  if (!isDatabaseConfigured()) return;

  const termo = palavra.termo.trim().toLowerCase();
  if (!termo) return;

  if (palavra.ativo && palavra.coletar_instagram) {
    await getPool().query(
      `INSERT INTO instagram_buscas (termo, ativo)
       VALUES ($1, TRUE)
       ON CONFLICT (termo) DO UPDATE SET ativo = TRUE`,
      [termo],
    );
  } else {
    await getPool().query(
      `UPDATE instagram_buscas SET ativo = FALSE WHERE lower(termo) = $1`,
      [termo],
    );
  }

  if (palavra.ativo && palavra.coletar_x) {
    await getPool().query(
      `INSERT INTO x_buscas (termo, ativo)
       VALUES ($1, TRUE)
       ON CONFLICT (termo) DO UPDATE SET ativo = TRUE`,
      [termo],
    );
  } else {
    await getPool().query(
      `UPDATE x_buscas SET ativo = FALSE WHERE lower(termo) = $1`,
      [termo],
    );
  }

  if (palavra.ativo && palavra.coletar_meta_ads) {
    await getPool().query(
      `INSERT INTO meta_ads_buscas (termo, ativo)
       VALUES ($1, TRUE)
       ON CONFLICT (termo) DO UPDATE SET ativo = TRUE`,
      [termo],
    );
  } else {
    await getPool().query(
      `UPDATE meta_ads_buscas SET ativo = FALSE WHERE lower(termo) = $1`,
      [termo],
    );
  }
}

async function pausarColetasDoTermo(termo: string): Promise<void> {
  const normalizado = termo.trim().toLowerCase();
  if (!normalizado) return;

  await getPool().query(
    `UPDATE instagram_buscas SET ativo = FALSE WHERE lower(termo) = $1`,
    [normalizado],
  );
  await getPool().query(
    `UPDATE x_buscas SET ativo = FALSE WHERE lower(termo) = $1`,
    [normalizado],
  );
  await getPool().query(
    `UPDATE meta_ads_buscas SET ativo = FALSE WHERE lower(termo) = $1`,
    [normalizado],
  );
}

export async function listarPalavrasChave(): Promise<PalavraChave[]> {
  if (!isDatabaseConfigured()) return [];

  await importarBuscasComoPalavras();

  const result = await getPool().query<{
    id: number;
    termo: string;
    ativo: boolean;
    coletar_instagram: boolean;
    coletar_x: boolean;
    coletar_meta_ads: boolean;
    criado_em: Date;
  }>(
    `SELECT id, termo, ativo, coletar_instagram, coletar_x, coletar_meta_ads, criado_em
     FROM palavras_chave
     ORDER BY termo ASC`,
  );

  return result.rows.map(mapPalavra);
}

export async function listarPalavrasChaveAtivas(): Promise<PalavraChave[]> {
  if (!isDatabaseConfigured()) return [];

  const result = await getPool().query<{
    id: number;
    termo: string;
    ativo: boolean;
    coletar_instagram: boolean;
    coletar_x: boolean;
    coletar_meta_ads: boolean;
    criado_em: Date;
  }>(
    `SELECT id, termo, ativo, coletar_instagram, coletar_x, coletar_meta_ads, criado_em
     FROM palavras_chave
     WHERE ativo = TRUE
     ORDER BY termo ASC`,
  );

  return result.rows.map(mapPalavra);
}

export async function criarPalavraChave(input: PalavraChaveInput): Promise<PalavraChave> {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL não configurado");
  }

  const termo = input.termo.trim().toLowerCase().replace(/\s+/g, " ");
  if (!termo) {
    throw new Error("Termo vazio");
  }

  const coletarInstagram = Boolean(input.coletarInstagram);
  const coletarX = Boolean(input.coletarX);
  const coletarMetaAds = Boolean(input.coletarMetaAds);

  const result = await getPool().query<{
    id: number;
    termo: string;
    ativo: boolean;
    coletar_instagram: boolean;
    coletar_x: boolean;
    coletar_meta_ads: boolean;
    criado_em: Date;
  }>(
    `INSERT INTO palavras_chave (termo, ativo, coletar_instagram, coletar_x, coletar_meta_ads)
     VALUES ($1, TRUE, $2, $3, $4)
     ON CONFLICT (termo) DO UPDATE SET
       ativo = TRUE,
       coletar_instagram = EXCLUDED.coletar_instagram,
       coletar_x = EXCLUDED.coletar_x,
       coletar_meta_ads = EXCLUDED.coletar_meta_ads
     RETURNING id, termo, ativo, coletar_instagram, coletar_x, coletar_meta_ads, criado_em`,
    [termo, coletarInstagram, coletarX, coletarMetaAds],
  );

  const palavra = mapPalavra(result.rows[0]);
  await sincronizarColetaPalavra(palavra);
  return palavra;
}

export async function atualizarPalavraChave(
  id: number,
  patch: {
    ativo?: boolean;
    coletarInstagram?: boolean;
    coletarX?: boolean;
    coletarMetaAds?: boolean;
  },
): Promise<PalavraChave | null> {
  if (!isDatabaseConfigured()) return null;

  const result = await getPool().query<{
    id: number;
    termo: string;
    ativo: boolean;
    coletar_instagram: boolean;
    coletar_x: boolean;
    coletar_meta_ads: boolean;
    criado_em: Date;
  }>(
    `UPDATE palavras_chave
     SET
       ativo = COALESCE($2, ativo),
       coletar_instagram = COALESCE($3, coletar_instagram),
       coletar_x = COALESCE($4, coletar_x),
       coletar_meta_ads = COALESCE($5, coletar_meta_ads)
     WHERE id = $1
     RETURNING id, termo, ativo, coletar_instagram, coletar_x, coletar_meta_ads, criado_em`,
    [
      id,
      patch.ativo ?? null,
      patch.coletarInstagram ?? null,
      patch.coletarX ?? null,
      patch.coletarMetaAds ?? null,
    ],
  );

  const row = result.rows[0];
  if (!row) return null;

  const palavra = mapPalavra(row);
  await sincronizarColetaPalavra(palavra);
  return palavra;
}

export async function removerPalavraChave(id: number): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;

  const atual = await getPool().query<{ termo: string }>(
    `SELECT termo FROM palavras_chave WHERE id = $1`,
    [id],
  );
  const termo = atual.rows[0]?.termo;
  if (!termo) return false;

  await pausarColetasDoTermo(termo);

  const result = await getPool().query(`DELETE FROM palavras_chave WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function alternarPalavraChave(
  id: number,
  ativo: boolean,
): Promise<PalavraChave | null> {
  return atualizarPalavraChave(id, { ativo });
}
