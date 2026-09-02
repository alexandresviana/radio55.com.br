"use client";

import BuscasMetaAds from "@/components/BuscasMetaAds";
import PaginasMetaAds from "@/components/PaginasMetaAds";

export default function AdminMetaAdsTab() {
  return (
    <>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900">Biblioteca de Anúncios</h2>
        <p className="text-sm text-slate-500">
          Cadastre páginas e acompanhe a coleta por termo (Assuntos → “Coletar Ads”). Anúncios e
          detecções ficam na página inicial.
        </p>
      </div>

      <BuscasMetaAds />
      <PaginasMetaAds />
    </>
  );
}
