import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import {
  criarPalavraChave,
  listarPalavrasChave,
} from "@/lib/palavras-chave-db";
import { agendarSyncInstagramPerfis } from "@/lib/instagram-monitor";
import { agendarSyncMetaAds } from "@/lib/meta-ads-monitor";
import { agendarSyncXBuscas } from "@/lib/x-monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Banco de dados não configurado no servidor", palavras: [] },
      { status: 503 },
    );
  }

  const palavras = await listarPalavrasChave();
  return NextResponse.json({ palavras });
}

export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Banco de dados não configurado no servidor" },
      { status: 503 },
    );
  }

  let body: {
    termo?: string;
    coletarInstagram?: boolean;
    coletarX?: boolean;
    coletarMetaAds?: boolean;
  };
  try {
    body = (await request.json()) as {
      termo?: string;
      coletarInstagram?: boolean;
      coletarX?: boolean;
      coletarMetaAds?: boolean;
    };
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const termo = body.termo?.trim();
  if (!termo) {
    return NextResponse.json({ error: "Informe o termo" }, { status: 400 });
  }

  try {
    const palavra = await criarPalavraChave({
      termo,
      coletarInstagram: body.coletarInstagram,
      coletarX: body.coletarX,
      coletarMetaAds: body.coletarMetaAds,
    });

    if (palavra.coletar_instagram) agendarSyncInstagramPerfis();
    if (palavra.coletar_x) agendarSyncXBuscas();
    if (palavra.coletar_meta_ads) agendarSyncMetaAds();

    return NextResponse.json({ palavra });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao salvar palavra" },
      { status: 400 },
    );
  }
}
