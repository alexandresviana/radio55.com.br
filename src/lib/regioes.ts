import type { EmissorasData } from "@/types";

/** Regiões iniciais sugeridas no admin (editáveis / livres). */
export const REGIOES_SUGERIDAS = [
  "Capital",
  "Agreste Sergipano",
  "Alto Sertão Sergipano",
  "Médio Sertão",
  "Baixo São Francisco",
  "Leste Sergipano",
  "Centro Sul",
  "Sul Sergipano",
  "Capital Salvador",
  "Centro Norte Baiano",
  "Centro Sul Baiano",
  "Extremo Oeste Baiano",
  "Metropolitana de Salvador e Recôncavo Baiano",
  "Nordeste Baiano",
  "Sul Baiano",
  "Vale São-Franciscano da Bahia",
] as const;

export function getRegioesFromData(data: EmissorasData): string[] {
  const set = new Set<string>();
  for (const m of Object.values(data)) set.add(m.regiao);
  return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function getRegioesParaSelect(data: EmissorasData): string[] {
  const set = new Set<string>([...REGIOES_SUGERIDAS, ...getRegioesFromData(data)]);
  return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export const REGIAO_CORES: Record<string, string> = {
  Capital: "#059669",
  "Agreste Sergipano": "#0284c7",
  "Alto Sertão Sergipano": "#d97706",
  "Médio Sertão": "#dc2626",
  "Baixo São Francisco": "#7c3aed",
  "Leste Sergipano": "#0891b2",
  "Centro Sul": "#ca8a04",
  "Sul Sergipano": "#db2777",
  "Capital Salvador": "#059669",
  "Centro Norte Baiano": "#0284c7",
  "Centro Sul Baiano": "#d97706",
  "Extremo Oeste Baiano": "#dc2626",
  "Metropolitana de Salvador e Recôncavo Baiano": "#7c3aed",
  "Nordeste Baiano": "#0891b2",
  "Sul Baiano": "#ca8a04",
  "Vale São-Franciscano da Bahia": "#db2777",
  BA: "#0d9488",
  SE: "#059669",
};

export function getRegiaoCor(regiao: string): string {
  if (REGIAO_CORES[regiao]) return REGIAO_CORES[regiao];

  const palette = ["#059669", "#0284c7", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#ca8a04", "#db2777"];
  let hash = 0;
  for (let i = 0; i < regiao.length; i += 1) {
    hash = (hash + regiao.charCodeAt(i) * (i + 1)) % palette.length;
  }
  return palette[hash] ?? "#64748b";
}
