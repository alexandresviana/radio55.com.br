import { NextResponse } from "next/server";
import { getBunnyStorageUploaderStatus } from "@/lib/bunny-storage-uploader";
import { getRecordingStatus } from "@/lib/recorder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gravacoes = await getRecordingStatus();
  return NextResponse.json({
    gravacoes,
    bunny_storage: getBunnyStorageUploaderStatus(),
  });
}
