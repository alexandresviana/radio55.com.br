import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import { buscarPublicacoesWeb, contarPublicacoesWeb } from "@/lib/web-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Banco de dados não configurado no servidor", artigos: [] },
      { status: 503 },
    );
  }

  const params = request.nextUrl.searchParams;
  const termo = params.get("termo") ?? undefined;
  const limite = Number(params.get("limite") ?? 20);
  const offset = Number(params.get("offset") ?? 0);

  const [artigos, total] = await Promise.all([
    buscarPublicacoesWeb({ termo, limite, offset }),
    contarPublicacoesWeb({ termo }),
  ]);

  return NextResponse.json({ artigos, total, limite, offset });
}
