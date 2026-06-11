import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import { buscarPreviewsAoVivo } from "@/lib/transcricoes-db";
import { getTranscriptionStatus } from "@/lib/transcription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "DATABASE_URL não configurado", previews: [] },
      { status: 503 },
    );
  }

  const aoVivo = request.nextUrl.searchParams.get("ao_vivo") === "1";
  if (!aoVivo) {
    return NextResponse.json(
      { error: "Use ao_vivo=1 para preview das gravações ativas" },
      { status: 400 },
    );
  }

  const previews = await buscarPreviewsAoVivo();

  return NextResponse.json({
    previews,
    janela_minutos: 30,
    transcricao: getTranscriptionStatus(),
  });
}
