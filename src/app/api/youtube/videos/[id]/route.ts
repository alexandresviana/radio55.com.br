import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "DATABASE_URL não configurado" }, { status: 503 });
  }

  const { id: idParam } = await context.params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const result = await getPool().query(
    `UPDATE youtube_videos
     SET status = 'pendente', erro_msg = NULL, processado_em = NULL
     WHERE id = $1
     RETURNING id`,
    [id],
  );

  if (!result.rows[0]) {
    return NextResponse.json({ error: "Vídeo não encontrado" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
