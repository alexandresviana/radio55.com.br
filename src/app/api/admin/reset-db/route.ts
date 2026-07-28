import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured, limparBaseDados } from "@/lib/db";
import { reseedEmissorasFromBundled } from "@/lib/emissoras";

/**
 * POST { "confirm": "LIMPAR" }
 * Zera gravações, transcrições, YouTube, palavras-chave e emissoras_config.
 * Em seguida recarrega o seed de emissoras. Login (AUTH_*) não é afetado.
 */
export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "DATABASE_URL não configurado" }, { status: 503 });
  }

  let body: { confirm?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (body.confirm !== "LIMPAR") {
    return NextResponse.json(
      { error: 'Envie { "confirm": "LIMPAR" } para confirmar a limpeza total.' },
      { status: 400 },
    );
  }

  const contagens = await limparBaseDados();
  const seed = await reseedEmissorasFromBundled();

  const porEstado: Record<string, number> = {};
  for (const dados of Object.values(seed)) {
    const uf = dados.estado ?? "?";
    porEstado[uf] = (porEstado[uf] ?? 0) + 1;
  }

  return NextResponse.json({
    ok: true,
    truncadas: contagens,
    emissorasRecarregadas: Object.keys(seed).length,
    porEstado,
  });
}
