import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import {
  buscarPublicacoesWeb,
  contarPublicacoesWeb,
  listarWebSitesAtivos,
} from "@/lib/web-db";
import { coletarSitesRssAgora } from "@/lib/web-monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Banco de dados não configurado no servidor", artigos: [] },
      { status: 503 },
    );
  }

  const params = request.nextUrl.searchParams;
  const termo = params.get("termo") ?? undefined;
  const limite = Number(params.get("limite") ?? 20);
  const offset = Number(params.get("offset") ?? 0);

  let [artigos, total] = await Promise.all([
    buscarPublicacoesWeb({ termo, limite, offset }),
    contarPublicacoesWeb({ termo }),
  ]);

  if (total === 0 && offset === 0 && !termo) {
    const sites = await listarWebSitesAtivos();
    const deveColetar = sites.some((site) => {
      if (!site.ultima_verificacao_em) return true;
      const idade = Date.now() - new Date(site.ultima_verificacao_em).getTime();
      return !Number.isFinite(idade) || idade >= 15 * 60_000;
    });
    if (sites.length > 0 && deveColetar) {
      await coletarSitesRssAgora();
      [artigos, total] = await Promise.all([
        buscarPublicacoesWeb({ termo, limite, offset }),
        contarPublicacoesWeb({ termo }),
      ]);
    }
  }

  return NextResponse.json({ artigos, total, limite, offset });
}
