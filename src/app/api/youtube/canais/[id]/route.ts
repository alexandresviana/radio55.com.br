import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import { atualizarYoutubeCanal, removerYoutubeCanal } from "@/lib/youtube-db";

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

  let body: { ativo?: boolean; titulo?: string };
  try {
    body = (await request.json()) as { ativo?: boolean; titulo?: string };
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const canal = await atualizarYoutubeCanal(id, body);
  if (!canal) {
    return NextResponse.json({ error: "Canal não encontrado" }, { status: 404 });
  }

  return NextResponse.json({ canal });
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

  const removed = await removerYoutubeCanal(id);
  if (!removed) {
    return NextResponse.json({ error: "Canal não encontrado" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
