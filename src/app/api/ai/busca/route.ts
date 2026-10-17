import { NextRequest, NextResponse } from "next/server";
import { parseIdioma } from "@/i18n/idioma";
import { executarBuscaIA, getLimitePorPaginaIA, isAiConfigured } from "@/lib/ai-busca";
import type { ConsultaInterpretada } from "@/lib/ai-busca-types";
import { isDatabaseConfigured } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Banco de dados não configurado no servidor" }, { status: 503 });
  }

  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: "A busca inteligente não está ativa neste servidor" },
      { status: 503 },
    );
  }

  let body: { prompt?: string; pagina?: number; interpretacao?: ConsultaInterpretada; idioma?: string };
  try {
    body = (await request.json()) as {
      prompt?: string;
      pagina?: number;
      interpretacao?: ConsultaInterpretada;
      idioma?: string;
    };
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const prompt = body.prompt?.trim();
  if (!prompt || prompt.length < 5) {
    return NextResponse.json({ error: "Descreva sua pergunta com pelo menos 5 caracteres" }, { status: 400 });
  }

  if (prompt.length > 2000) {
    return NextResponse.json({ error: "Pergunta muito longa (máx. 2000 caracteres)" }, { status: 400 });
  }

  const pagina = typeof body.pagina === "number" && body.pagina >= 0 ? Math.floor(body.pagina) : 0;

  try {
    const resultado = await executarBuscaIA({
      prompt,
      pagina,
      interpretacao: body.interpretacao,
      idioma: parseIdioma(body.idioma) ?? "pt",
    });
    return NextResponse.json(resultado);
  } catch (error) {
    console.error("[ai/busca]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro na busca com IA" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    disponivel: isAiConfigured() && isDatabaseConfigured(),
    porPagina: getLimitePorPaginaIA(),
  });
}
