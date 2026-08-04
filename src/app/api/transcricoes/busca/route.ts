import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import { buscarNasTranscricoesComTotal } from "@/lib/transcricoes-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Banco de dados não configurado no servidor", resultados: [] },
      { status: 503 },
    );
  }

  const params = request.nextUrl.searchParams;
  const termo = params.get("termo")?.trim() ?? "";

  if (!termo) {
    return NextResponse.json({ error: "Informe o termo de busca" }, { status: 400 });
  }

  const limite = params.get("limite") ? Number(params.get("limite")) : 30;
  const offset = params.get("offset") ? Number(params.get("offset")) : 0;

  try {
    const { resultados, total } = await buscarNasTranscricoesComTotal({
      termo,
      limite,
      offset,
    });

    return NextResponse.json({ resultados, total, limite, offset, termo });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao buscar";
    const timeout =
      /statement timeout|canceling statement/i.test(message) ||
      (typeof error === "object" &&
        error !== null &&
        "code" in error &&
        String((error as { code?: string }).code) === "57014");

    console.error("[transcricoes/busca]", message);
    return NextResponse.json(
      {
        error: timeout
          ? "A busca demorou demais. Tente um termo mais específico."
          : "Erro ao buscar nas transcrições",
        resultados: [],
        total: 0,
      },
      { status: timeout ? 504 : 500 },
    );
  }
}
