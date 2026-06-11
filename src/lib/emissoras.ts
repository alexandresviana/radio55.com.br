import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { getDataDir } from "@/lib/data-dir";
import type { EmissorasData, MunicipioData, Radio } from "@/types";

const DATA_FILE = path.join(getDataDir(), "emissoras.json");
const GEO_FILE = path.join(process.cwd(), "public/data/sergipe-mun.json");

export async function readEmissoras(): Promise<EmissorasData> {
  try {
    const raw = await readFile(DATA_FILE, "utf-8");
    return JSON.parse(raw) as EmissorasData;
  } catch {
    const fallback = path.join(process.cwd(), "src/data/emissoras.json");
    const raw = await readFile(fallback, "utf-8");
    return JSON.parse(raw) as EmissorasData;
  }
}

export async function writeEmissoras(data: EmissorasData): Promise<void> {
  await mkdir(getDataDir(), { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

export async function readMunicipios(): Promise<string[]> {
  const raw = await readFile(GEO_FILE, "utf-8");
  const geo = JSON.parse(raw) as { features: { properties: { name: string } }[] };
  return geo.features.map((f) => f.properties.name).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function isValidRadio(radio: Radio): boolean {
  return (
    typeof radio.nome === "string" &&
    radio.nome.trim().length > 0 &&
    typeof radio.pj === "number" &&
    radio.pj >= 0 &&
    (radio.tipo === "comercial" || radio.tipo === "comunitaria") &&
    (radio.gravar === undefined || typeof radio.gravar === "boolean")
  );
}

function isValidMunicipioData(data: MunicipioData): boolean {
  return (
    typeof data.regiao === "string" &&
    data.regiao.trim().length > 0 &&
    Array.isArray(data.radios) &&
    data.radios.every(isValidRadio)
  );
}

export function validateEmissoras(data: unknown): data is EmissorasData {
  if (!data || typeof data !== "object") return false;
  return Object.entries(data as Record<string, unknown>).every(
    ([nome, value]) => typeof nome === "string" && nome.trim().length > 0 && isValidMunicipioData(value as MunicipioData),
  );
}
