"use client";

import BuscasX from "@/components/BuscasX";
import { useI18n } from "@/i18n/I18nProvider";

export default function AdminXTab() {
  const { t } = useI18n();
  return (
    <>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900">{t("Monitoramento do X")}</h2>
        <p className="text-sm text-slate-500">
          {t(
            "Status da coleta. Cadastre o assunto na aba Assuntos e marque “Coletar X”. Posts e detecções ficam na página inicial.",
          )}
        </p>
      </div>

      <BuscasX />
    </>
  );
}
