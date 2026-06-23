import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import { limparTrechosInexistentes } from "@/lib/trecho-deteccao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "DATABASE_URL não configurado" }, { status: 503 });
  }

  const resultado = await limparTrechosInexistentes();

  return NextResponse.json({
    ok: true,
    ...resultado,
  });
}
