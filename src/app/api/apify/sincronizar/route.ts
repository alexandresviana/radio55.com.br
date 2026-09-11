import { NextResponse } from "next/server";
import { garantirColetaAtualizada } from "@/lib/coleta-coletor";
import {
  consumirInstagramCompartilhado,
  consumirMetaAdsCompartilhado,
  consumirWebCompartilhado,
  consumirXCompartilhado,
  publicarFontesInstagram,
  publicarFontesMetaAds,
  publicarFontesWeb,
  publicarFontesX,
} from "@/lib/coleta-consumidor";
import {
  ColetaCooldownError,
  isColetaCompartilhada,
  reservarForcarColetaLocal,
  statusForcarColeta,
  statusForcarColetaLocal,
} from "@/lib/coleta-db";
import { isDatabaseConfigured } from "@/lib/db";
import { getInstagramMonitorStatus, syncInstagramPerfisAgora } from "@/lib/instagram-monitor";
import { getMetaAdsMonitorStatus, syncMetaAdsAgora } from "@/lib/meta-ads-monitor";
import { coletarSitesRssAgora, getWebMonitorStatus, syncWebAgora } from "@/lib/web-monitor";
import { getXMonitorStatus, syncXBuscasAgora } from "@/lib/x-monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function respostaCooldown(error: ColetaCooldownError) {
  return NextResponse.json(
    {
      ok: false,
      error: error.message,
      erros: [error.message],
      retry_after_segundos: error.retryAfterSegundos,
    },
    { status: 429 },
  );
}

export async function GET() {
  try {
    const status = isColetaCompartilhada()
      ? await statusForcarColeta()
      : statusForcarColetaLocal();
    return NextResponse.json(status);
  } catch {
    return NextResponse.json({
      pode_forcar: true,
      retry_after_segundos: 0,
      intervalo_minutos: 60,
    });
  }
}

export async function POST() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Banco de dados não configurado no servidor" },
      { status: 503 },
    );
  }

  if (isColetaCompartilhada()) {
    try {
      await publicarFontesInstagram();
      await publicarFontesX();
      await publicarFontesMetaAds();
      await publicarFontesWeb();
      await garantirColetaAtualizada({ forcar: true });
      const novos = {
        instagram: await consumirInstagramCompartilhado(),
        x: await consumirXCompartilhado(),
        meta: await consumirMetaAdsCompartilhado(),
        web: (await coletarSitesRssAgora()) + (await consumirWebCompartilhado()),
      };
      return NextResponse.json({
        ok: true,
        erros: [],
        novos,
        instagram: getInstagramMonitorStatus(),
        x: getXMonitorStatus(),
        meta_ads: getMetaAdsMonitorStatus(),
        web: getWebMonitorStatus(),
      });
    } catch (error) {
      if (error instanceof ColetaCooldownError) {
        return respostaCooldown(error);
      }
      const msg =
        error instanceof Error ? error.message : "Falha ao atualizar as redes";
      return NextResponse.json(
        { ok: false, error: msg, erros: [msg] },
        { status: 504 },
      );
    }
  }

  try {
    reservarForcarColetaLocal();
  } catch (error) {
    if (error instanceof ColetaCooldownError) {
      return respostaCooldown(error);
    }
    throw error;
  }

  const erros: string[] = [];

  const rodar = async (nome: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (error) {
      const msg = error instanceof Error ? error.message : `Falha em ${nome}`;
      erros.push(`${nome}: ${msg}`);
      console.error(`[apify] sync forçado ${nome}:`, msg);
    }
  };

  await Promise.all([
    rodar("instagram", syncInstagramPerfisAgora),
    rodar("x", syncXBuscasAgora),
    rodar("meta-ads", syncMetaAdsAgora),
    rodar("web", syncWebAgora),
  ]);

  return NextResponse.json({
    ok: erros.length === 0,
    erros,
    instagram: getInstagramMonitorStatus(),
    x: getXMonitorStatus(),
    meta_ads: getMetaAdsMonitorStatus(),
    web: getWebMonitorStatus(),
  });
}
