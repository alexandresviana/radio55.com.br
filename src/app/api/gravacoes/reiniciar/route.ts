import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import { reiniciarGravacoes } from "@/lib/recorder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "DATABASE_URL não configurado" }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    municipio?: string;
    nome?: string;
  };

  const reiniciadas = await reiniciarGravacoes({
    municipio: body.municipio?.trim() || undefined,
    nome: body.nome?.trim() || undefined,
  });

  return NextResponse.json({
    ok: true,
    reiniciadas,
    mensagem:
      reiniciadas > 0
        ? `${reiniciadas} gravação(ões) reiniciada(s).`
        : "Nenhuma gravação ativa para reiniciar.",
  });
}
