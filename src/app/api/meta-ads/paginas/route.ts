import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import { criarMetaAdsPagina, listarMetaAdsPaginas } from "@/lib/meta-ads-db";
import { extrairPaginaFacebook, urlPaginaFacebook } from "@/lib/meta-ads-fetch";
import { syncMetaAdsAgora } from "@/lib/meta-ads-monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Banco de dados não configurado no servidor", paginas: [] },
      { status: 503 },
    );
  }

  const paginas = await listarMetaAdsPaginas();
  return NextResponse.json({ paginas });
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
    return NextResponse.json({ error: "Informe a URL ou nome da página" }, { status: 400 });
  }

  const slug = extrairPaginaFacebook(entrada);
  if (!slug) {
    return NextResponse.json(
      {
        error:
          "Página inválida. Use uma URL do Facebook (ex.: facebook.com/seunome) ou o slug/ID.",
      },
      { status: 400 },
    );
  }

  try {
    const pagina = await criarMetaAdsPagina({
      slug,
      urlEntrada: urlPaginaFacebook(slug),
      titulo: slug,
    });
    void syncMetaAdsAgora();
    return NextResponse.json({ pagina }, { status: 201 });
  } catch (error) {
    const pgCode =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: string }).code)
        : "";
    if (pgCode === "23505") {
      return NextResponse.json({ error: "Esta página já está cadastrada" }, { status: 409 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao cadastrar página" },
      { status: 400 },
    );
  }
}
