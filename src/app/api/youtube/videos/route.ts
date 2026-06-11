import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import {
  buscarYoutubeVideos,
  contarYoutubeVideos,
  type YoutubeVideoStatus,
} from "@/lib/youtube-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_VALUES = new Set<YoutubeVideoStatus>([
  "pendente",
  "processando",
  "concluido",
  "erro",
  "sem_transcript",
  "aguardando",
]);

export async function GET(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "DATABASE_URL não configurado", videos: [] }, { status: 503 });
  }

  const params = request.nextUrl.searchParams;
  const canalId = params.get("canal_id") ? Number(params.get("canal_id")) : undefined;
  const statusParam = params.get("status") as YoutubeVideoStatus | null;
  const status =
    statusParam && STATUS_VALUES.has(statusParam) ? statusParam : undefined;

  const limite = params.get("limite") ? Number(params.get("limite")) : 20;
  const offset = params.get("offset") ? Number(params.get("offset")) : 0;
  const filtros = {
    canalId: Number.isFinite(canalId) ? canalId : undefined,
    status,
  };

  const [videos, total] = await Promise.all([
    buscarYoutubeVideos({ ...filtros, limite, offset }),
    contarYoutubeVideos(filtros),
  ]);

  return NextResponse.json({ videos, total, limite, offset });
}
