import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import { listarPreviewsTranscricaoYoutube } from "@/lib/youtube-transcricoes-db";
import { getYoutubeMonitorStatus } from "@/lib/youtube-monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "DATABASE_URL não configurado", monitor: getYoutubeMonitorStatus(), previews: [] },
      { status: 503 },
    );
  }

  const previews = await listarPreviewsTranscricaoYoutube(5);

  return NextResponse.json({
    monitor: getYoutubeMonitorStatus(),
    previews,
  });
}
