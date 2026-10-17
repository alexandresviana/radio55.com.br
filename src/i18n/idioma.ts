export type Idioma = "pt" | "es" | "en";

export const IDIOMAS: { id: Idioma; label: string }[] = [
  { id: "pt", label: "Português" },
  { id: "es", label: "Español" },
  { id: "en", label: "English" },
];

export const IDIOMA_STORAGE_KEY = "orbitview-idioma";

export function parseIdioma(value: unknown): Idioma | null {
  if (value === "pt" || value === "es" || value === "en") return value;
  return null;
}

export function intlLocale(idioma: Idioma): string {
  if (idioma === "es") return "es-419";
  if (idioma === "en") return "en-US";
  return "pt-BR";
}

export function htmlLang(idioma: Idioma): string {
  if (idioma === "es") return "es";
  if (idioma === "en") return "en";
  return "pt-BR";
}

export function nomeIdioma(idioma: Idioma): string {
  if (idioma === "es") return "español";
  if (idioma === "en") return "English";
  return "português do Brasil";
}
