import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import { criarWebSite, listarWebSites } from "@/lib/web-db";
import { agendarSyncWeb } from "@/lib/web-monitor";
import { descobrirFeed } from "@/lib/web-rss-fetch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Banco de dados não configurado no servidor", sites: [] },
      { status: 503 },
    );
  }

  const sites = await listarWebSites();
  return NextResponse.json({ sites });
}

export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Banco de dados não configurado no servidor" },
      { status: 503 },
    );
  }

  let body: { url?: string };
  try {
    body = (await request.json()) as { url?: string };
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const entrada = body.url?.trim();
  if (!entrada) {
    return NextResponse.json({ error: "Informe a URL do site ou do feed RSS" }, { status: 400 });
  }

  try {
    const feed = await descobrirFeed(entrada);
    const site = await criarWebSite({
      dominio: feed.dominio,
      titulo: feed.titulo,
      urlEntrada: feed.urlEntrada,
      feedUrl: feed.feedUrl,
    });
    agendarSyncWeb();
    return NextResponse.json({ site }, { status: 201 });
  } catch (error) {
    const pgCode =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: string }).code)
        : "";
    if (pgCode === "23505") {
      return NextResponse.json({ error: "Este site já está cadastrado" }, { status: 409 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao cadastrar site" },
      { status: 400 },
    );
  }
}
