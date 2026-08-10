import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import { atualizarMetaAdsPagina, removerMetaAdsPagina } from "@/lib/meta-ads-db";
import { agendarSyncMetaAds } from "@/lib/meta-ads-monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Banco de dados não configurado no servidor" },
      { status: 503 },
    );
  }

  const id = Number((await context.params).id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  let body: { ativo?: boolean; titulo?: string };
  try {
    body = (await request.json()) as { ativo?: boolean; titulo?: string };
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const pagina = await atualizarMetaAdsPagina(id, body);
  if (!pagina) {
    return NextResponse.json({ error: "Página não encontrada" }, { status: 404 });
  }

  if (pagina.ativo) agendarSyncMetaAds();
  return NextResponse.json({ pagina });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Banco de dados não configurado no servidor" },
      { status: 503 },
    );
  }

  const id = Number((await context.params).id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const ok = await removerMetaAdsPagina(id);
  if (!ok) {
    return NextResponse.json({ error: "Página não encontrada" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
