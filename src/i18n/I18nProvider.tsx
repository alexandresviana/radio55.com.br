"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { htmlLang, IDIOMA_STORAGE_KEY, intlLocale, parseIdioma, type Idioma } from "@/i18n/idioma";
import { translate } from "@/i18n/messages";

type Vars = Record<string, string | number>;

interface I18nContextValue {
  idioma: Idioma;
  setIdioma: (idioma: Idioma) => void;
  t: (key: string, vars?: Vars) => string;
  formatDateTime: (
    iso: string | null | undefined,
    options?: { seconds?: boolean; year?: boolean },
  ) => string;
  formatAxis: (iso: string, janela: "24h" | "7d" | "30d") => string;
  formatHover: (iso: string, janela: "24h" | "7d" | "30d") => string;
  formatRelative: (iso: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function readStoredIdioma(): Idioma {
  try {
    const stored = parseIdioma(localStorage.getItem(IDIOMA_STORAGE_KEY));
    if (stored) return stored;
  } catch {
    /* storage indisponível */
  }
  const nav = navigator.language.toLowerCase();
  if (nav.startsWith("es")) return "es";
  if (nav.startsWith("en")) return "en";
  return "pt";
}

function subscribeIdioma(onChange: () => void) {
  window.addEventListener("orbitview-idioma", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener("orbitview-idioma", onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const idioma = useSyncExternalStore(subscribeIdioma, readStoredIdioma, () => "pt" as Idioma);

  const setIdioma = useCallback((next: Idioma) => {
    try {
      localStorage.setItem(IDIOMA_STORAGE_KEY, next);
    } catch {
      /* ignora */
    }
    document.documentElement.lang = htmlLang(next);
    window.dispatchEvent(new Event("orbitview-idioma"));
  }, []);

  useEffect(() => {
    document.documentElement.lang = htmlLang(idioma);
  }, [idioma]);

  const value = useMemo<I18nContextValue>(() => {
    const locale = intlLocale(idioma);
    const t = (key: string, vars?: Vars) => translate(idioma, key, vars);

    function formatDateTime(
      iso: string | null | undefined,
      options?: { seconds?: boolean; year?: boolean },
    ): string {
      if (!iso) return "—";
      const year = options?.year !== false;
      return new Date(iso).toLocaleString(locale, {
        day: "2-digit",
        month: "2-digit",
        ...(year ? { year: "numeric" as const } : {}),
        hour: "2-digit",
        minute: "2-digit",
        ...(options?.seconds ? { second: "2-digit" as const } : {}),
      });
    }

    function formatAxis(iso: string, janela: "24h" | "7d" | "30d"): string {
      const data = new Date(iso);
      if (janela === "24h") {
        return data.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
      }
      return data.toLocaleDateString(locale, { day: "2-digit", month: "2-digit" });
    }

    function formatHover(iso: string, janela: "24h" | "7d" | "30d"): string {
      const data = new Date(iso);
      if (janela === "24h") {
        return data.toLocaleString(locale, {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
      }
      return data.toLocaleDateString(locale, {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
      });
    }

    function formatRelative(iso: string): string {
      const data = new Date(iso);
      const diffMin = Math.max(0, Math.floor((Date.now() - data.getTime()) / 60000));
      if (diffMin < 1) return t("agora");
      if (diffMin < 60) return t("há {n} min", { n: diffMin });
      const diffH = Math.floor(diffMin / 60);
      if (diffH < 24) return t("há {n} h", { n: diffH });
      return formatDateTime(iso, { year: false });
    }

    return { idioma, setIdioma, t, formatDateTime, formatAxis, formatHover, formatRelative };
  }, [idioma, setIdioma]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n deve ser usado dentro de I18nProvider");
  }
  return ctx;
}
