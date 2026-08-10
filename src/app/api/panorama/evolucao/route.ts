import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import {
  buscarEvolucaoPanorama,
  buscarEvolucaoPanoramaFontes,
  type FontePanorama,
  type JanelaPanorama,
} from "@/lib/panorama-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JANELAS = new Set<JanelaPanorama>(["24h", "7d", "30d"]);
const FONTES = new Set<FontePanorama>([
  "radio",
  "youtube",
  "instagram",
  "x",
  "meta_ads",
]);

export async function GET(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Banco de dados não configurado no servidor", pontos: [], series: [] },
      { status: 503 },
    );
  }

  const params = request.nextUrl.searchParams;
  const termo = params.get("termo")?.trim() || undefined;
  const janelaRaw = (params.get("janela") ?? "24h") as JanelaPanorama;
  const janela = JANELAS.has(janelaRaw) ? janelaRaw : "24h";
  const fonteRaw = params.get("fonte")?.trim() as FontePanorama | null;

  try {
    if (fonteRaw && FONTES.has(fonteRaw)) {
      const { series, pontos } = await buscarEvolucaoPanoramaFontes({
        fonte: fonteRaw,
        termo,
        janela,
      });
      return NextResponse.json({ pontos, series, janela, fonte: fonteRaw });
    }

    const pontos = await buscarEvolucaoPanorama({ termo, janela });
    return NextResponse.json({ pontos, janela });
  } catch (error) {
    console.error("[panorama/evolucao]", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erro ao carregar evolução",
        pontos: [],
        series: [],
      },
      { status: 500 },
    );
  }
}
