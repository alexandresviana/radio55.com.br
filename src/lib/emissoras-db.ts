import { getPool, isDatabaseConfigured } from "@/lib/db";
import type { EmissorasData } from "@/types";

const CONFIG_ID = 1;

export async function readEmissorasFromDb(): Promise<EmissorasData | null> {
  if (!isDatabaseConfigured()) return null;

  const result = await getPool().query<{ dados: EmissorasData }>(
    `SELECT dados FROM emissoras_config WHERE id = $1`,
    [CONFIG_ID],
  );

  const row = result.rows[0];
  if (!row?.dados || typeof row.dados !== "object") return null;

  return row.dados;
}

export async function writeEmissorasToDb(data: EmissorasData): Promise<void> {
  if (!isDatabaseConfigured()) return;

  await getPool().query(
    `INSERT INTO emissoras_config (id, dados, atualizado_em)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE SET
       dados = EXCLUDED.dados,
       atualizado_em = NOW()`,
    [CONFIG_ID, JSON.stringify(data)],
  );
}
