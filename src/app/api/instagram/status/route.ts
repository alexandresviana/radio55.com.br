import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import { getInstagramMonitorStatus, syncInstagramPerfisAgora } from "@/lib/instagram-monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Banco de dados não configurado no servidor" }, { status: 503 });
  }

  return NextResponse.json({ monitor: getInstagramMonitorStatus() });
}

export async function POST() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Banco de dados não configurado no servidor" }, { status: 503 });
  }

  await syncInstagramPerfisAgora();
  return NextResponse.json({ ok: true, monitor: getInstagramMonitorStatus() });
}
