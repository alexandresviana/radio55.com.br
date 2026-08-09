import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import { buscarMetaAds, contarMetaAds } from "@/lib/meta-ads-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Banco de dados não configurado no servidor", anuncios: [], total: 0 },
      { status: 503 },
    );
  }

  const params = request.nextUrl.searchParams;
  const termo = params.get("termo")?.trim() || undefined;
  const limite = params.get("limite") ? Number(params.get("limite")) : 20;
  const offset = params.get("offset") ? Number(params.get("offset")) : 0;

  const [anuncios, total] = await Promise.all([
    buscarMetaAds({ termo, limite, offset }),
    contarMetaAds({ termo }),
  ]);

  return NextResponse.json({ anuncios, total, limite, offset });
}
