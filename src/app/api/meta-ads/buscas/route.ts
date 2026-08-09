import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import { listarMetaAdsBuscas } from "@/lib/meta-ads-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Banco de dados não configurado no servidor", buscas: [] },
      { status: 503 },
    );
  }

  const buscas = await listarMetaAdsBuscas();
  return NextResponse.json({ buscas });
}
