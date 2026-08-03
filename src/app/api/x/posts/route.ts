import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import { buscarXPosts, contarXPosts } from "@/lib/x-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Banco de dados não configurado no servidor", posts: [] },
      { status: 503 },
    );
  }

  const params = request.nextUrl.searchParams;
  const termo = params.get("termo") ?? undefined;
  const limite = Number(params.get("limite") ?? 20);
  const offset = Number(params.get("offset") ?? 0);

  const filtros = { termo };
  const [posts, total] = await Promise.all([
    buscarXPosts({ ...filtros, limite, offset }),
    contarXPosts(filtros),
  ]);

  return NextResponse.json({ posts, total, limite, offset });
}
