"use client";

import { IDIOMAS, type Idioma } from "@/i18n/idioma";
import { useI18n } from "@/i18n/I18nProvider";

export default function SeletorIdioma({ destaque = false }: { destaque?: boolean }) {
  const { idioma, setIdioma, t } = useI18n();

  return (
    <div
      role="group"
      aria-label={t("Idioma")}
      className={destaque ? "grid grid-cols-3 gap-2" : "flex items-center gap-1"}
    >
      {IDIOMAS.map((opcao) => {
        const ativo = idioma === opcao.id;
        return (
          <button
            key={opcao.id}
            type="button"
            onClick={() => setIdioma(opcao.id as Idioma)}
            aria-pressed={ativo}
            className={
              destaque
                ? `rounded-lg px-2 py-2 text-sm font-medium transition ${
                    ativo
                      ? "bg-emerald-700 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`
                : `rounded-md px-2 py-1 text-xs font-semibold tracking-wide transition ${
                    ativo
                      ? "bg-white/20 text-white"
                      : "text-emerald-100/70 hover:bg-white/10 hover:text-white"
                  }`
            }
          >
            {opcao.label}
          </button>
        );
      })}
    </div>
  );
}
