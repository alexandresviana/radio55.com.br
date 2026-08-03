import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import { listarResumosTranscricaoYoutube } from "@/lib/youtube-transcricoes-db";
import { getYoutubeMonitorStatus } from "@/lib/youtube-monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Banco de dados não configurado no servidor", monitor: getYoutubeMonitorStatus(), previews: [] },
      { status: 503 },
    );
  }

  const resumos = await listarResumosTranscricaoYoutube(8);

  return NextResponse.json({
    monitor: getYoutubeMonitorStatus(),
    resumos,
  });
}
