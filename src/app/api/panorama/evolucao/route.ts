import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import { buscarEvolucaoPanorama24h } from "@/lib/panorama-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Banco de dados não configurado no servidor", pontos: [] },
      { status: 503 },
    );
  }

  const termo = request.nextUrl.searchParams.get("termo")?.trim() || undefined;

  try {
    const pontos = await buscarEvolucaoPanorama24h({ termo });
    return NextResponse.json({ pontos, janela: "24h" });
  } catch (error) {
    console.error("[panorama/evolucao]", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erro ao carregar evolução",
        pontos: [],
      },
      { status: 500 },
    );
  }
}
