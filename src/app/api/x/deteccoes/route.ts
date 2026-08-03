import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import { buscarDeteccoesX, contarDeteccoesX } from "@/lib/x-deteccoes-db";
import { getXMonitorStatus, reescanearDeteccoesXAgora } from "@/lib/x-monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Banco de dados não configurado no servidor", deteccoes: [] },
      { status: 503 },
    );
  }

  const params = request.nextUrl.searchParams;
  const termo = params.get("termo") ?? undefined;
  const limite = Number(params.get("limite") ?? 20);
  const offset = Number(params.get("offset") ?? 0);

  if (params.get("reescanear") === "1") {
    await reescanearDeteccoesXAgora(50).catch(() => {});
  }

  const filtros = { termo };
  const [deteccoes, total] = await Promise.all([
    buscarDeteccoesX({ ...filtros, limite, offset }),
    contarDeteccoesX(filtros),
  ]);

  return NextResponse.json({
    deteccoes,
    total,
    limite,
    offset,
    monitor: getXMonitorStatus(),
  });
}
