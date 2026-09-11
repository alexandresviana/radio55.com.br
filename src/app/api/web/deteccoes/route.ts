import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import { buscarDeteccoesWeb, contarDeteccoesWeb } from "@/lib/web-deteccoes-db";
import { getWebMonitorStatus, reescanearDeteccoesWebAgora } from "@/lib/web-monitor";

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
    await reescanearDeteccoesWebAgora(50).catch(() => {});
  }

  const [deteccoes, total] = await Promise.all([
    buscarDeteccoesWeb({ termo, limite, offset }),
    contarDeteccoesWeb({ termo }),
  ]);

  return NextResponse.json({
    deteccoes,
    total,
    limite,
    offset,
    monitor: getWebMonitorStatus(),
  });
}
