import { NextRequest, NextResponse } from "next/server";
import { isAiConfigured } from "@/lib/ai-client";
import { gerarRelatorioPanorama } from "@/lib/ai-relatorio";
import { isDatabaseConfigured } from "@/lib/db";
import type { FontePanorama, JanelaPanorama } from "@/lib/panorama-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const JANELAS = new Set<JanelaPanorama>(["24h", "7d", "30d"]);
const FONTES = new Set<FontePanorama | "todas">([
  "todas",
  "radio",
  "youtube",
  "instagram",
  "x",
  "meta_ads",
]);

export async function GET(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Banco de dados não configurado no servidor" },
      { status: 503 },
    );
  }

  const params = request.nextUrl.searchParams;
  const janelaRaw = (params.get("janela") ?? "24h") as JanelaPanorama;
  const fonteRaw = (params.get("fonte") ?? "todas") as FontePanorama | "todas";
  const termo = params.get("termo")?.trim() || undefined;
  const refresh = params.get("refresh") === "1";

  try {
    const relatorio = await gerarRelatorioPanorama({
      janela: JANELAS.has(janelaRaw) ? janelaRaw : "24h",
      fonte: FONTES.has(fonteRaw) ? fonteRaw : "todas",
      termo,
      refresh,
    });

    return NextResponse.json({ relatorio, ia_configurada: isAiConfigured() });
  } catch (error) {
    console.error("[panorama/relatorio]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao montar o relatório" },
      { status: 500 },
    );
  }
}
