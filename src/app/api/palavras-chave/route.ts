import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import {
  criarPalavraChave,
  listarPalavrasChave,
} from "@/lib/palavras-chave-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "DATABASE_URL não configurado", palavras: [] }, { status: 503 });
  }

  const palavras = await listarPalavrasChave();
  return NextResponse.json({ palavras });
}

export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "DATABASE_URL não configurado" }, { status: 503 });
  }

  const body = (await request.json()) as { termo?: string };
  const termo = body.termo?.trim();

  if (!termo) {
    return NextResponse.json({ error: "Informe o termo" }, { status: 400 });
  }

  try {
    const palavra = await criarPalavraChave(termo);
    return NextResponse.json({ palavra });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao salvar palavra" },
      { status: 400 },
    );
  }
}
