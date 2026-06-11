import { access, readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { getDataDir } from "@/lib/data-dir";
import { readEmissorasFromDb, writeEmissorasToDb } from "@/lib/emissoras-db";
import { isDatabaseConfigured } from "@/lib/db";
import type { EmissorasData, MunicipioData, Radio } from "@/types";

const DATA_FILE = path.join(getDataDir(), "emissoras.json");
const GEO_FILE = path.join(process.cwd(), "public/data/sergipe-mun.json");

const SEED_PATHS = [
  path.join(getDataDir(), "emissoras.json"),
  "/app/data-seed/emissoras.json",
  path.join(process.cwd(), "data/emissoras.json"),
  path.join(process.cwd(), "src/data/emissoras.json"),
];

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readSeedEmissoras(): Promise<EmissorasData> {
  for (const seedPath of SEED_PATHS) {
    if (!(await fileExists(seedPath))) continue;
    const raw = await readFile(seedPath, "utf-8");
    return JSON.parse(raw) as EmissorasData;
  }

  throw new Error("Nenhum arquivo seed de emissoras encontrado");
}

async function readEmissorasFromFile(): Promise<EmissorasData | null> {
  if (!(await fileExists(DATA_FILE))) return null;
  const raw = await readFile(DATA_FILE, "utf-8");
  return JSON.parse(raw) as EmissorasData;
}

export async function readEmissoras(): Promise<EmissorasData> {
  if (isDatabaseConfigured()) {
    const fromDb = await readEmissorasFromDb();
    if (fromDb) {
      return fromDb;
    }

    const fromFile = await readEmissorasFromFile();
    if (fromFile) {
      await writeEmissorasToDb(fromFile);
      console.info("[emissoras] Configuração migrada do arquivo para o PostgreSQL");
      return fromFile;
    }

    const seed = await readSeedEmissoras();
    await writeEmissorasToDb(seed);
    await writeEmissoras(seed);
    console.warn(
      "[emissoras] Nenhuma configuração persistida encontrada — usando seed padrão (gravar=false em todas)",
    );
    return seed;
  }

  try {
    const fromFile = await readEmissorasFromFile();
    if (fromFile) return fromFile;
    return await readSeedEmissoras();
  } catch {
    return await readSeedEmissoras();
  }
}

export async function writeEmissoras(data: EmissorasData): Promise<void> {
  await mkdir(getDataDir(), { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(data, null, 2) + "\n", "utf-8");

  if (isDatabaseConfigured()) {
    await writeEmissorasToDb(data);
  }
}

export async function readMunicipios(): Promise<string[]> {
  const raw = await readFile(GEO_FILE, "utf-8");
  const geo = JSON.parse(raw) as { features: { properties: { name: string } }[] };
  return geo.features.map((f) => f.properties.name).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function isValidStreamUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isValidRadio(radio: Radio): boolean {
  const streamOk =
    radio.streamUrl === undefined ||
    (typeof radio.streamUrl === "string" &&
      (radio.streamUrl.trim() === "" || isValidStreamUrl(radio.streamUrl)));

  return (
    typeof radio.nome === "string" &&
    radio.nome.trim().length > 0 &&
    typeof radio.pj === "number" &&
    radio.pj >= 0 &&
    (radio.tipo === "comercial" || radio.tipo === "comunitaria") &&
    (radio.gravar === undefined || typeof radio.gravar === "boolean") &&
    streamOk
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
