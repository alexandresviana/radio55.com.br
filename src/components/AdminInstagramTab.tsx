"use client";

import BuscasInstagram from "@/components/BuscasInstagram";
import PerfisInstagram from "@/components/PerfisInstagram";
import { useI18n } from "@/i18n/I18nProvider";

export default function AdminInstagramTab() {
  const { t } = useI18n();
  return (
    <>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900">{t("Monitoramento do Instagram")}</h2>
        <p className="text-sm text-slate-500">
          {t(
            "Cadastre perfis e acompanhe a coleta. Posts e detecções ficam na página inicial. Os assuntos ficam na aba Assuntos — marque “Coletar IG” para puxar posts por hashtag.",
          )}
        </p>
      </div>

      <BuscasInstagram />
      <PerfisInstagram />
    </>
  );
}
