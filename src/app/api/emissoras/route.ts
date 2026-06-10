import { NextRequest, NextResponse } from "next/server";
import { readEmissoras, validateEmissoras, writeEmissoras } from "@/lib/emissoras";
import { syncRecordings } from "@/lib/recorder";

export async function GET() {
  const data = await readEmissoras();
  return NextResponse.json(data);
}

export async function PUT(request: NextRequest) {
  const body = await request.json();

  if (!validateEmissoras(body)) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  await writeEmissoras(body);
  void syncRecordings();
  return NextResponse.json({ ok: true });
}
