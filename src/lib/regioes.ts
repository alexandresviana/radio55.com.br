import type { EmissorasData } from "@/types";

export const REGIOES = [
  "Capital",
  "Agreste Sergipano",
  "Alto Sertão Sergipano",
  "Médio Sertão",
  "Baixo São Francisco",
  "Leste Sergipano",
  "Centro Sul",
  "Sul Sergipano",
] as const;

export type Regiao = (typeof REGIOES)[number];

export function getRegioesFromData(data: EmissorasData): string[] {
  const set = new Set<string>();
  for (const m of Object.values(data)) set.add(m.regiao);
  return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export const REGIAO_CORES: Record<Regiao, string> = {
  Capital: "#059669",
  "Agreste Sergipano": "#0284c7",
  "Alto Sertão Sergipano": "#d97706",
  "Médio Sertão": "#dc2626",
  "Baixo São Francisco": "#7c3aed",
  "Leste Sergipano": "#0891b2",
  "Centro Sul": "#ca8a04",
  "Sul Sergipano": "#db2777",
};
