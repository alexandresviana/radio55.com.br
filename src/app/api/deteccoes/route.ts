import { NextRequest, NextResponse } from "next/server";
import { buscarDeteccoes } from "@/lib/deteccoes-db";
import { isDatabaseConfigured } from "@/lib/db";
import { getTranscriptionStatus } from "@/lib/transcription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "DATABASE_URL não configurado", deteccoes: [] }, { status: 503 });
  }

  const params = request.nextUrl.searchParams;

  const deteccoes = await buscarDeteccoes({
    municipio: params.get("municipio") ?? undefined,
    radio: params.get("radio") ?? undefined,
    termo: params.get("termo") ?? undefined,
    aoVivo: params.get("ao_vivo") === "1" ? true : undefined,
    limite: params.get("limite") ? Number(params.get("limite")) : undefined,
  });

  return NextResponse.json({
    deteccoes,
    transcricao: getTranscriptionStatus(),
  });
}
