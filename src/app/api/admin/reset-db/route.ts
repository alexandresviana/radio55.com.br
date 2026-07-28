import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured, limparBaseDados } from "@/lib/db";

/**
 * POST { "confirm": "LIMPAR" }
 * Apaga gravações/transcrições de rádio e canais YouTube monitorados.
 * Mantém emissoras, palavras-chave e login (AUTH_*).
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
      { error: 'Envie { "confirm": "LIMPAR" } para confirmar.' },
      { status: 400 },
    );
  }

  const contagens = await limparBaseDados();

  return NextResponse.json({
    ok: true,
    truncadas: contagens,
  });
}
