import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import { atualizarWebSite, removerWebSite } from "@/lib/web-db";
import { coletarSiteRssAgora } from "@/lib/web-monitor";

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

  const site = await atualizarWebSite(id, body);
  if (!site) {
    return NextResponse.json({ error: "Site não encontrado" }, { status: 404 });
  }

  if (site.ativo && body.ativo === true) {
    await coletarSiteRssAgora(site);
  }
  return NextResponse.json({ site });
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

  const ok = await removerWebSite(id);
  if (!ok) {
    return NextResponse.json({ error: "Site não encontrado" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
