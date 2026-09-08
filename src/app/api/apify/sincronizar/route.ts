import { NextResponse } from "next/server";
import { garantirColetaAtualizada } from "@/lib/coleta-coletor";
import {
  consumirInstagramCompartilhado,
  consumirMetaAdsCompartilhado,
  consumirXCompartilhado,
  publicarFontesInstagram,
  publicarFontesMetaAds,
  publicarFontesX,
} from "@/lib/coleta-consumidor";
import { isColetaCompartilhada } from "@/lib/coleta-db";
import { isDatabaseConfigured } from "@/lib/db";
import { getInstagramMonitorStatus, syncInstagramPerfisAgora } from "@/lib/instagram-monitor";
import { getMetaAdsMonitorStatus, syncMetaAdsAgora } from "@/lib/meta-ads-monitor";
import { getXMonitorStatus, syncXBuscasAgora } from "@/lib/x-monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
      await garantirColetaAtualizada({ forcar: true });
      const novos = {
        instagram: await consumirInstagramCompartilhado(),
        x: await consumirXCompartilhado(),
        meta: await consumirMetaAdsCompartilhado(),
      };
      return NextResponse.json({
        ok: true,
        erros: [],
        novos,
        instagram: getInstagramMonitorStatus(),
        x: getXMonitorStatus(),
        meta_ads: getMetaAdsMonitorStatus(),
      });
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Falha ao atualizar as redes";
      return NextResponse.json(
        { ok: false, error: msg, erros: [msg] },
        { status: 504 },
      );
    }
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
  ]);

  return NextResponse.json({
    ok: erros.length === 0,
    erros,
    instagram: getInstagramMonitorStatus(),
    x: getXMonitorStatus(),
    meta_ads: getMetaAdsMonitorStatus(),
  });
}
