import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import {
  buscarDeteccoesMetaAds,
  contarDeteccoesMetaAds,
} from "@/lib/meta-ads-deteccoes-db";
import {
  getMetaAdsMonitorStatus,
  reescanearDeteccoesMetaAdsAgora,
} from "@/lib/meta-ads-monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Banco de dados não configurado no servidor", deteccoes: [], total: 0 },
      { status: 503 },
    );
  }

  const params = request.nextUrl.searchParams;
  if (params.get("reescanear") === "1") {
    void reescanearDeteccoesMetaAdsAgora();
  }

  const termo = params.get("termo")?.trim() || undefined;
  const limite = params.get("limite") ? Number(params.get("limite")) : 30;
  const offset = params.get("offset") ? Number(params.get("offset")) : 0;

  const [deteccoes, total] = await Promise.all([
    buscarDeteccoesMetaAds({ termo, limite, offset }),
    contarDeteccoesMetaAds({ termo }),
  ]);

  return NextResponse.json({
    deteccoes,
    total,
    limite,
    offset,
    monitor: getMetaAdsMonitorStatus(),
  });
}
