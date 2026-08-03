import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import {
  buscarComentariosInstagram,
  contarComentariosInstagram,
} from "@/lib/instagram-comentarios-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Banco de dados não configurado no servidor", comentarios: [] },
      { status: 503 },
    );
  }

  const params = request.nextUrl.searchParams;
  const postDbIdRaw = params.get("post_db_id");
  const postDbId = postDbIdRaw ? Number(postDbIdRaw) : undefined;
  const termo = params.get("termo") ?? undefined;
  const limite = Number(params.get("limite") ?? 50);
  const offset = Number(params.get("offset") ?? 0);

  const filtros = {
    postDbId: Number.isFinite(postDbId) ? postDbId : undefined,
    termo,
  };

  const [comentarios, total] = await Promise.all([
    buscarComentariosInstagram({ ...filtros, limite, offset }),
    contarComentariosInstagram(filtros),
  ]);

  return NextResponse.json({ comentarios, total, limite, offset });
}
