import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import { listarSegmentosYoutube } from "@/lib/youtube-transcricoes-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "DATABASE_URL não configurado", segmentos: [] }, { status: 503 });
  }

  const videoDbId = Number(request.nextUrl.searchParams.get("video_db_id"));
  if (!Number.isFinite(videoDbId)) {
    return NextResponse.json({ error: "video_db_id inválido" }, { status: 400 });
  }

  const limite = Number(request.nextUrl.searchParams.get("limite") ?? 300);
  const segmentos = await listarSegmentosYoutube(videoDbId, limite);

  return NextResponse.json({ segmentos });
}
