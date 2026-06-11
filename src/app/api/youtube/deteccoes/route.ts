import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import { buscarDeteccoesYoutube } from "@/lib/youtube-deteccoes-db";
import { getYoutubeMonitorStatus } from "@/lib/youtube-monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "DATABASE_URL não configurado", deteccoes: [] }, { status: 503 });
  }

  const params = request.nextUrl.searchParams;
  const canalId = params.get("canal_id") ? Number(params.get("canal_id")) : undefined;

  const deteccoes = await buscarDeteccoesYoutube({
    canalId: Number.isFinite(canalId) ? canalId : undefined,
    termo: params.get("termo") ?? undefined,
    limite: params.get("limite") ? Number(params.get("limite")) : undefined,
  });

  return NextResponse.json({
    deteccoes,
    monitor: getYoutubeMonitorStatus(),
  });
}
