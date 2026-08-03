import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import { atualizarInstagramBusca, removerInstagramBusca } from "@/lib/instagram-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Banco de dados não configurado no servidor" }, { status: 503 });
  }

  const { id: idParam } = await context.params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  let body: { ativo?: boolean };
  try {
    body = (await request.json()) as { ativo?: boolean };
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const busca = await atualizarInstagramBusca(id, body);
  if (!busca) {
    return NextResponse.json({ error: "Termo não encontrado" }, { status: 404 });
  }

  return NextResponse.json({ busca });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Banco de dados não configurado no servidor" }, { status: 503 });
  }

  const { id: idParam } = await context.params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const removed = await removerInstagramBusca(id);
  if (!removed) {
    return NextResponse.json({ error: "Termo não encontrado" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
