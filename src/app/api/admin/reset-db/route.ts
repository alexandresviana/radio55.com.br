import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured, limparBaseDados } from "@/lib/db";

/**
 * POST { "confirm": "LIMPAR" }
 * Apaga arquivos gravados (disco/Bunny), gravações/transcrições de rádio,
 * canais YouTube e perfis Instagram monitorados. Mantém emissoras, palavras-chave e login.
 */
export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Banco de dados não configurado no servidor" }, { status: 503 });
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
