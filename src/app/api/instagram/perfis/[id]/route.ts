import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import { atualizarInstagramPerfil, removerInstagramPerfil } from "@/lib/instagram-db";

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

  let body: { ativo?: boolean; titulo?: string };
  try {
    body = (await request.json()) as { ativo?: boolean; titulo?: string };
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const perfil = await atualizarInstagramPerfil(id, body);
  if (!perfil) {
    return NextResponse.json({ error: "Perfil não encontrado" }, { status: 404 });
  }

  return NextResponse.json({ perfil });
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

  const removed = await removerInstagramPerfil(id);
  if (!removed) {
    return NextResponse.json({ error: "Perfil não encontrado" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
