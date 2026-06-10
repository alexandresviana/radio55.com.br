import { NextResponse } from "next/server";
import { getRecordingStatus } from "@/lib/recorder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gravacoes = await getRecordingStatus();
  return NextResponse.json({ gravacoes });
}
