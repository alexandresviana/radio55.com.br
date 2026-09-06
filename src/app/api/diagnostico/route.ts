import { NextResponse } from "next/server";
import { obterDiagnosticoCpu } from "@/lib/cpu-diagnostico";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(obterDiagnosticoCpu());
  } catch (error) {
    console.error("[diagnostico]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao obter diagnóstico" },
      { status: 500 },
    );
  }
}
