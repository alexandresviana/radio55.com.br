import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import { criarXBusca, listarXBuscas } from "@/lib/x-db";
import { extrairTermoX } from "@/lib/x-fetch";
import { agendarSyncXBuscas } from "@/lib/x-monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Banco de dados não configurado no servidor", buscas: [] },
      { status: 503 },
    );
  }

  const buscas = await listarXBuscas();
  return NextResponse.json({ buscas });
}

export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Banco de dados não configurado no servidor" },
      { status: 503 },
    );
  }

  let body: { termo?: string };
  try {
    body = (await request.json()) as { termo?: string };
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const entrada = body.termo?.trim();
  if (!entrada) {
    return NextResponse.json({ error: "Informe o termo a monitorar" }, { status: 400 });
  }

  const termo = extrairTermoX(entrada);
  if (!termo) {
    return NextResponse.json(
      {
        error:
          "Termo inválido. Use uma palavra (ex.: eleicoes) ou uma frase (ex.: fabio mitidieri).",
      },
      { status: 400 },
    );
  }

  try {
    const busca = await criarXBusca(termo);
    agendarSyncXBuscas();
    return NextResponse.json({ busca }, { status: 201 });
  } catch (error) {
    const pgCode =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: string }).code)
        : "";
    if (pgCode === "23505") {
      return NextResponse.json({ error: "Este termo já está cadastrado" }, { status: 409 });
    }

    const message = error instanceof Error ? error.message : "Erro ao cadastrar termo";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
