import { NextRequest, NextResponse } from "next/server";
import { buildPlayUrl, getRadioStream } from "@/lib/radios-streams";

export async function GET(request: NextRequest) {
  const municipio = request.nextUrl.searchParams.get("municipio");
  const nome = request.nextUrl.searchParams.get("nome");

  if (!municipio || !nome) {
    return NextResponse.json({ error: "municipio e nome são obrigatórios" }, { status: 400 });
  }

  const info = await getRadioStream(municipio, nome);
  if (!info) {
    return NextResponse.json({ error: "Rádio não encontrada no radios.com.br" }, { status: 404 });
  }

  const playUrl = buildPlayUrl(info.streamUrl, municipio, nome);

  return NextResponse.json({
    ...info,
    playUrl,
    proxied: playUrl?.startsWith("/api/") ?? false,
  });
}
