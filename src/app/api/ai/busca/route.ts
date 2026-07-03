import { NextRequest, NextResponse } from "next/server";
import { executarBuscaIA, isAiConfigured } from "@/lib/ai-busca";
import { isDatabaseConfigured } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "DATABASE_URL não configurado" }, { status: 503 });
  }

  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: "Configure OPENAI_API_KEY para usar a busca com IA" },
      { status: 503 },
    );
  }

  let body: { prompt?: string };
  try {
    body = (await request.json()) as { prompt?: string };
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

  try {
    const resultado = await executarBuscaIA(prompt);
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
    modelo: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
  });
}
