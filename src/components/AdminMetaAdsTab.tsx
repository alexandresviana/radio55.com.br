"use client";

import BuscasMetaAds from "@/components/BuscasMetaAds";
import MetaAdsAnuncios from "@/components/MetaAdsAnuncios";
import MetaAdsDeteccoes from "@/components/MetaAdsDeteccoes";
import PaginasMetaAds from "@/components/PaginasMetaAds";

export default function AdminMetaAdsTab() {
  return (
    <>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900">Biblioteca de Anúncios</h2>
        <p className="text-sm text-slate-500">
          Monitora anúncios ativos no Brasil por termo (Assuntos → “Coletar Ads”) ou por página
          anunciante. A detecção de assuntos vale em todas as mídias.
        </p>
      </div>

      <BuscasMetaAds />
      <PaginasMetaAds />
      <MetaAdsAnuncios />
      <MetaAdsDeteccoes />
    </>
  );
}
