import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import { getXMonitorStatus, syncXBuscasAgora } from "@/lib/x-monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Banco de dados não configurado no servidor" },
      { status: 503 },
    );
  }

  return NextResponse.json({ monitor: getXMonitorStatus() });
}

export async function POST() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Banco de dados não configurado no servidor" },
      { status: 503 },
    );
  }

  await syncXBuscasAgora();
  return NextResponse.json({ ok: true, monitor: getXMonitorStatus() });
}
