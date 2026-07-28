export const ESTADOS = [
  { uf: "BA", label: "Bahia", geo: "/data/bahia-mun.json" },
  { uf: "SE", label: "Sergipe", geo: "/data/sergipe-mun.json" },
] as const;

export type Uf = (typeof ESTADOS)[number]["uf"];

export const UF_PADRAO: Uf = "BA";

export function getEstadoMeta(uf: string) {
  return ESTADOS.find((item) => item.uf === uf) ?? ESTADOS[0];
}

export function geoPathForUf(uf: string): string {
  return getEstadoMeta(uf).geo;
}
