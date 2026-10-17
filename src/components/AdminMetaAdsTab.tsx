"use client";

import BuscasMetaAds from "@/components/BuscasMetaAds";
import PaginasMetaAds from "@/components/PaginasMetaAds";
import { useI18n } from "@/i18n/I18nProvider";

export default function AdminMetaAdsTab() {
  const { t } = useI18n();
  return (
    <>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900">{t("Biblioteca de Anúncios")}</h2>
        <p className="text-sm text-slate-500">
          {t(
            "Cadastre páginas e acompanhe a coleta por termo (Assuntos → “Coletar Ads”). Anúncios e detecções ficam na página inicial.",
          )}
        </p>
      </div>

      <BuscasMetaAds />
      <PaginasMetaAds />
    </>
  );
}
