import { NextResponse } from "next/server";
import { getBunnyStorageUploaderStatus } from "@/lib/bunny-storage-uploader";
import { getRecordingStatus } from "@/lib/recorder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const gravacoes = await getRecordingStatus();
    return NextResponse.json({
      gravacoes,
      bunny_storage: getBunnyStorageUploaderStatus(),
    });
  } catch (error) {
    console.error("[gravacoes/status]", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erro ao obter status das gravações",
        gravacoes: [],
      },
      { status: 500 },
    );
  }
}
