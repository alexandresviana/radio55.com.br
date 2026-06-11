import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import {
  alternarPalavraChave,
  removerPalavraChave,
} from "@/lib/palavras-chave-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "DATABASE_URL não configurado" }, { status: 503 });
  }

  const { id: idParam } = await context.params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const body = (await request.json()) as { ativo?: boolean };
  if (typeof body.ativo !== "boolean") {
    return NextResponse.json({ error: "Campo ativo obrigatório" }, { status: 400 });
  }

  const palavra = await alternarPalavraChave(id, body.ativo);
  if (!palavra) {
    return NextResponse.json({ error: "Palavra não encontrada" }, { status: 404 });
  }

  return NextResponse.json({ palavra });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "DATABASE_URL não configurado" }, { status: 503 });
  }

  const { id: idParam } = await context.params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const ok = await removerPalavraChave(id);
  if (!ok) {
    return NextResponse.json({ error: "Palavra não encontrada" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
