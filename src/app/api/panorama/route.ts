import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import {
  buscarPanorama,
  contarPanorama,
  listarAssuntosPanorama,
  type FontePanorama,
  type JanelaPanorama,
} from "@/lib/panorama-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JANELAS = new Set<JanelaPanorama>(["24h", "7d", "30d"]);
const FONTES = new Set<FontePanorama | "todas">([
  "todas",
  "radio",
  "youtube",
  "instagram",
  "x",
]);

export async function GET(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Banco de dados não configurado no servidor", itens: [], contagens: null },
      { status: 503 },
    );
  }

  const params = request.nextUrl.searchParams;
  const termo = params.get("termo")?.trim() || undefined;
  const janelaRaw = (params.get("janela") ?? "24h") as JanelaPanorama;
  const fonteRaw = (params.get("fonte") ?? "todas") as FontePanorama | "todas";
  const limite = Number(params.get("limite") ?? 30);
  const offset = Number(params.get("offset") ?? 0);

  const janela = JANELAS.has(janelaRaw) ? janelaRaw : "24h";
  const fonte = FONTES.has(fonteRaw) ? fonteRaw : "todas";

  const [itens, contagens, assuntos] = await Promise.all([
    buscarPanorama({ termo, janela, fonte, limite, offset }),
    contarPanorama({ termo, janela }),
    listarAssuntosPanorama(),
  ]);

  return NextResponse.json({
    itens,
    contagens,
    assuntos,
    janela,
    fonte,
    termo: termo ?? "",
    limite,
    offset,
  });
}
