import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import { resolveYoutubeChannel } from "@/lib/youtube-channel";
import { criarYoutubeCanal, listarYoutubeCanais } from "@/lib/youtube-db";
import { syncYoutubeCanaisAgora } from "@/lib/youtube-monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "DATABASE_URL não configurado", canais: [] }, { status: 503 });
  }

  const canais = await listarYoutubeCanais();
  return NextResponse.json({ canais });
}

export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "DATABASE_URL não configurado" }, { status: 503 });
  }

  let body: { url?: string };
  try {
    body = (await request.json()) as { url?: string };
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const url = body.url?.trim();
  if (!url) {
    return NextResponse.json({ error: "Informe a URL do canal" }, { status: 400 });
  }

  try {
    const resolved = await resolveYoutubeChannel(url);
    const canal = await criarYoutubeCanal({
      channelId: resolved.channelId,
      titulo: resolved.titulo,
      urlEntrada: url,
    });

    void syncYoutubeCanaisAgora();

    return NextResponse.json({ canal }, { status: 201 });
  } catch (error) {
    const pgCode =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: string }).code)
        : "";
    if (pgCode === "23505") {
      return NextResponse.json({ error: "Este canal já está cadastrado" }, { status: 409 });
    }

    const message = error instanceof Error ? error.message : "Erro ao cadastrar canal";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
