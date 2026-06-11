import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import { buscarGravacoes, listarRadiosGravadas } from "@/lib/gravacoes-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "DATABASE_URL não configurado", arquivos: [], radios: [] },
      { status: 503 },
    );
  }

  const params = request.nextUrl.searchParams;
  const opcoes = params.get("opcoes");

  if (opcoes === "1") {
    const radios = await listarRadiosGravadas();
    return NextResponse.json({ radios });
  }

  const arquivos = await buscarGravacoes({
    municipio: params.get("municipio") ?? undefined,
    radio: params.get("radio") ?? undefined,
    dia: params.get("dia") ?? undefined,
    horaDe: params.get("horaDe") ?? undefined,
    horaAte: params.get("horaAte") ?? undefined,
    limite: params.get("limite") ? Number(params.get("limite")) : undefined,
  });

  return NextResponse.json({ arquivos });
}
