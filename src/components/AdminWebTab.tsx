"use client";

import SitesWeb from "@/components/SitesWeb";
import { useI18n } from "@/i18n/I18nProvider";

export default function AdminWebTab() {
  const { t } = useI18n();
  return (
    <>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900">{t("Monitoramento da web")}</h2>
      </div>

      <SitesWeb />
    </>
  );
}
