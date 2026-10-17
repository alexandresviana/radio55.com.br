"use client";

import CanaisYouTube from "@/components/CanaisYouTube";
import YoutubePainel from "@/components/YoutubePainel";
import { useI18n } from "@/i18n/I18nProvider";

export default function AdminYoutubeTab() {
  const { t } = useI18n();
  return (
    <>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900">{t("Canais do YouTube")}</h2>
        <p className="text-sm text-slate-500">
          {t("Cadastre canais e acompanhe a coleta. A busca nas legendas fica na página inicial.")}
        </p>
      </div>

      <CanaisYouTube />
      <YoutubePainel />
    </>
  );
}
