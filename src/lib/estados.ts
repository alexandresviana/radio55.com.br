import type { EmissorasData, MunicipioData } from "@/types";

export const ESTADOS = [
  { uf: "BA", label: "Bahia", geo: "/data/bahia-mun.json" },
  { uf: "SE", label: "Sergipe", geo: "/data/sergipe-mun.json" },
  { uf: "AL", label: "Alagoas", geo: "/data/alagoas-mun.json" },
] as const;

export type Uf = (typeof ESTADOS)[number]["uf"];

export const UF_PADRAO: Uf = "BA";

export function getEstadoMeta(uf: string) {
  return ESTADOS.find((item) => item.uf === uf) ?? ESTADOS[0];
}

export function geoPathForUf(uf: string): string {
  return getEstadoMeta(uf).geo;
}

/** Nome no mapa/IBGE, sem sufixo de UF usado em colisão (ex.: "Capela (AL)"). */
export function nomeMunicipioExibicao(nome: string): string {
  return nome.replace(/ \([A-Z]{2}\)$/, "");
}

export function nomesMunicipioCandidatos(nome: string, uf?: string): string[] {
  const nomes = [nome, nomeMunicipioExibicao(nome)];
  if (uf) nomes.push(`${nomeMunicipioExibicao(nome)} (${uf})`);
  return [...new Set(nomes)];
}

export function getMunicipioData(
  emissoras: EmissorasData,
  nome: string,
  uf?: string,
): { key: string; dados: MunicipioData } | null {
  for (const key of nomesMunicipioCandidatos(nome, uf)) {
    const dados = emissoras[key];
    if (!dados) continue;
    if (uf && (dados.estado ?? "SE") !== uf) continue;
    return { key, dados };
  }

  const geo = nomeMunicipioExibicao(nome);
  for (const [key, dados] of Object.entries(emissoras)) {
    if (nomeMunicipioExibicao(key) !== geo) continue;
    if (uf && (dados.estado ?? "SE") !== uf) continue;
    return { key, dados };
  }

  return null;
}
