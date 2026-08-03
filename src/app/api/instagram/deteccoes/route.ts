import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import {
  buscarDeteccoesInstagram,
  contarDeteccoesInstagram,
} from "@/lib/instagram-deteccoes-db";
import {
  getInstagramMonitorStatus,
  reescanearDeteccoesInstagramAgora,
} from "@/lib/instagram-monitor";

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
  const perfilIdRaw = params.get("perfil_id");
  const perfilId = perfilIdRaw ? Number(perfilIdRaw) : undefined;
  const termo = params.get("termo") ?? undefined;
  const limite = Number(params.get("limite") ?? 20);
  const offset = Number(params.get("offset") ?? 0);

  if (params.get("reescanear") === "1") {
    await reescanearDeteccoesInstagramAgora(50).catch(() => {});
  }

  const filtros = {
    perfilId: Number.isFinite(perfilId) ? perfilId : undefined,
    termo,
  };

  const [deteccoes, total] = await Promise.all([
    buscarDeteccoesInstagram({ ...filtros, limite, offset }),
    contarDeteccoesInstagram(filtros),
  ]);

  return NextResponse.json({
    deteccoes,
    total,
    limite,
    offset,
    monitor: getInstagramMonitorStatus(),
  });
}
