import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import { buscarDeteccoesYoutube, contarDeteccoesYoutube } from "@/lib/youtube-deteccoes-db";
import { getYoutubeMonitorStatus, reescanearDeteccoesYoutubeAgora } from "@/lib/youtube-monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "DATABASE_URL não configurado", deteccoes: [] }, { status: 503 });
  }

  const params = request.nextUrl.searchParams;
  const canalId = params.get("canal_id") ? Number(params.get("canal_id")) : undefined;
  const limite = params.get("limite") ? Number(params.get("limite")) : 30;
  const offset = params.get("offset") ? Number(params.get("offset")) : 0;
  const termo = params.get("termo") ?? undefined;

  if (params.get("reescanear") === "1") {
    void reescanearDeteccoesYoutubeAgora(30);
  }

  const filtros = {
    canalId: Number.isFinite(canalId) ? canalId : undefined,
    termo,
  };

  const [deteccoes, total] = await Promise.all([
    buscarDeteccoesYoutube({ ...filtros, limite, offset }),
    contarDeteccoesYoutube(filtros),
  ]);

  return NextResponse.json({
    deteccoes,
    total,
    limite,
    offset,
    monitor: getYoutubeMonitorStatus(),
  });
}
