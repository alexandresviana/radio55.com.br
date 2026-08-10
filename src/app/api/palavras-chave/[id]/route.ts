import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import {
  atualizarPalavraChave,
  removerPalavraChave,
} from "@/lib/palavras-chave-db";
import { agendarSyncInstagramPerfis } from "@/lib/instagram-monitor";
import { agendarSyncMetaAds } from "@/lib/meta-ads-monitor";
import { agendarSyncXBuscas } from "@/lib/x-monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Banco de dados não configurado no servidor" },
      { status: 503 },
    );
  }

  const { id: idParam } = await context.params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  let body: {
    ativo?: boolean;
    coletarInstagram?: boolean;
    coletarX?: boolean;
    coletarMetaAds?: boolean;
  };
  try {
    body = (await request.json()) as {
      ativo?: boolean;
      coletarInstagram?: boolean;
      coletarX?: boolean;
      coletarMetaAds?: boolean;
    };
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (
    typeof body.ativo !== "boolean" &&
    typeof body.coletarInstagram !== "boolean" &&
    typeof body.coletarX !== "boolean" &&
    typeof body.coletarMetaAds !== "boolean"
  ) {
    return NextResponse.json(
      { error: "Informe ativo, coletarInstagram, coletarX e/ou coletarMetaAds" },
      { status: 400 },
    );
  }

  const palavra = await atualizarPalavraChave(id, {
    ativo: typeof body.ativo === "boolean" ? body.ativo : undefined,
    coletarInstagram:
      typeof body.coletarInstagram === "boolean" ? body.coletarInstagram : undefined,
    coletarX: typeof body.coletarX === "boolean" ? body.coletarX : undefined,
    coletarMetaAds:
      typeof body.coletarMetaAds === "boolean" ? body.coletarMetaAds : undefined,
  });

  if (!palavra) {
    return NextResponse.json({ error: "Palavra não encontrada" }, { status: 404 });
  }

  if (palavra.coletar_instagram && palavra.ativo) agendarSyncInstagramPerfis();
  if (palavra.coletar_x && palavra.ativo) agendarSyncXBuscas();
  if (palavra.coletar_meta_ads && palavra.ativo) agendarSyncMetaAds();

  return NextResponse.json({ palavra });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Banco de dados não configurado no servidor" },
      { status: 503 },
    );
  }

  const { id: idParam } = await context.params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const ok = await removerPalavraChave(id);
  if (!ok) {
    return NextResponse.json({ error: "Palavra não encontrada" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
