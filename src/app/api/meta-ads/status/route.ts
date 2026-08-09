import { NextResponse } from "next/server";
import { getMetaAdsMonitorStatus, syncMetaAdsAgora } from "@/lib/meta-ads-monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ monitor: getMetaAdsMonitorStatus() });
}

export async function POST() {
  try {
    await syncMetaAdsAgora();
    return NextResponse.json({ monitor: getMetaAdsMonitorStatus() });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erro ao sincronizar",
        monitor: getMetaAdsMonitorStatus(),
      },
      { status: 500 },
    );
  }
}
