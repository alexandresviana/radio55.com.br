import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import {
  buscarNasTranscricoesYoutube,
  contarBuscaNasTranscricoesYoutube,
} from "@/lib/youtube-transcricoes-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "DATABASE_URL não configurado", resultados: [] },
      { status: 503 },
    );
  }

  const params = request.nextUrl.searchParams;
  const termo = params.get("termo")?.trim() ?? "";

  if (!termo) {
    return NextResponse.json({ error: "Informe o termo de busca" }, { status: 400 });
  }

  const limite = params.get("limite") ? Number(params.get("limite")) : 20;
  const offset = params.get("offset") ? Number(params.get("offset")) : 0;

  const [resultados, total] = await Promise.all([
    buscarNasTranscricoesYoutube({ termo, limite, offset }),
    contarBuscaNasTranscricoesYoutube(termo),
  ]);

  return NextResponse.json({ resultados, total, limite, offset, termo });
}
