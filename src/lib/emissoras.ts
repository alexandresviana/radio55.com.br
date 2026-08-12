import { access, readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { getDataDir } from "@/lib/data-dir";
import { UF_PADRAO, geoPathForUf } from "@/lib/estados";
import { readEmissorasFromDb, writeEmissorasToDb } from "@/lib/emissoras-db";
import { isDatabaseConfigured } from "@/lib/db";
import type { EmissorasData, MunicipioData, Radio } from "@/types";

const DATA_FILE = path.join(getDataDir(), "emissoras.json");

const BUNDLED_SEED_PATHS = [
  "/app/data-seed/emissoras.json",
  path.join(process.cwd(), "data/emissoras.json"),
  path.join(process.cwd(), "src/data/emissoras.json"),
];

const SEED_PATHS = [...BUNDLED_SEED_PATHS, path.join(getDataDir(), "emissoras.json")];

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readBundledSeedEmissoras(): Promise<EmissorasData> {
  for (const seedPath of BUNDLED_SEED_PATHS) {
    if (!(await fileExists(seedPath))) continue;
    const raw = await readFile(seedPath, "utf-8");
    return JSON.parse(raw) as EmissorasData;
  }

  throw new Error("Nenhum arquivo seed embutido de emissoras encontrado");
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

function mergeEmissorasComSeed(
  atual: EmissorasData,
  seed: EmissorasData,
): { dados: EmissorasData; alterado: boolean } {
  const merged: EmissorasData = { ...atual };
  let alterado = false;

  for (const [nome, dados] of Object.entries(seed)) {
    const existente = merged[nome];
    const seedUf = dados.estado ?? "SE";
    const atualUf = existente?.estado ?? "SE";

    if (!existente) {
      merged[nome] = dados;
      alterado = true;
      continue;
    }

    if (seedUf !== atualUf) {
      merged[nome] = dados;
      alterado = true;
      continue;
    }

    if (!existente.estado && dados.estado) {
      merged[nome] = dados;
      alterado = true;
      continue;
    }

    const seedRadios = dados.radios.length;
    const atualRadios = existente.radios.length;
    if (seedRadios > atualRadios) {
      merged[nome] = dados;
      alterado = true;
    }
  }

  return { dados: merged, alterado };
}

async function sincronizarEmissorasComSeed(atual: EmissorasData): Promise<EmissorasData> {
  try {
    const seed = await readBundledSeedEmissoras();
    const { dados, alterado } = mergeEmissorasComSeed(atual, seed);
    if (!alterado) return atual;

    await writeEmissoras(dados);
    console.info(
      `[emissoras] sync seed: ${Object.keys(atual).length} -> ${Object.keys(dados).length} municípios`,
    );
    return dados;
  } catch {
    return atual;
  }
}

/** Recarrega o seed embutido e sobrescreve arquivo + banco. */
export async function reseedEmissorasFromBundled(): Promise<EmissorasData> {
  const seed = await readBundledSeedEmissoras();
  await writeEmissoras(seed);
  return seed;
}

// Cache em memória: o JSON tem vários MB e era relido do banco a cada chamada
// (o indexador chama por arquivo MP3 — isso esgotava o pool de conexões).
const EMISSORAS_CACHE_TTL_MS = 30_000;

type EmissorasGlobal = typeof globalThis & {
  __radio55EmissorasCache?: { dados: EmissorasData; expiraEm: number };
  __radio55EmissorasInflight?: Promise<EmissorasData>;
};

function setEmissorasCache(dados: EmissorasData): void {
  const globalRef = globalThis as EmissorasGlobal;
  globalRef.__radio55EmissorasCache = {
    dados,
    expiraEm: Date.now() + EMISSORAS_CACHE_TTL_MS,
  };
}

export async function readEmissoras(): Promise<EmissorasData> {
  const globalRef = globalThis as EmissorasGlobal;

  const cache = globalRef.__radio55EmissorasCache;
  if (cache && cache.expiraEm > Date.now()) return cache.dados;

  if (globalRef.__radio55EmissorasInflight) {
    return globalRef.__radio55EmissorasInflight;
  }

  globalRef.__radio55EmissorasInflight = loadEmissoras()
    .then((dados) => {
      setEmissorasCache(dados);
      return dados;
    })
    .finally(() => {
      globalRef.__radio55EmissorasInflight = undefined;
    });

  return globalRef.__radio55EmissorasInflight;
}

async function loadEmissoras(): Promise<EmissorasData> {
  if (isDatabaseConfigured()) {
    const fromDb = await readEmissorasFromDb();
    if (fromDb) {
      return sincronizarEmissorasComSeed(fromDb);
    }

    const fromFile = await readEmissorasFromFile();
    if (fromFile) {
      console.info("[emissoras] Configuração migrada do arquivo para o PostgreSQL");
      const synced = await sincronizarEmissorasComSeed(fromFile);
      const stillEmpty = !(await readEmissorasFromDb());
      if (stillEmpty) await writeEmissoras(synced);
      return synced;
    }

    const seed = await readBundledSeedEmissoras();
    await writeEmissoras(seed);
    console.warn(
      "[emissoras] Nenhuma configuração persistida encontrada — usando seed padrão (gravar=false em todas)",
    );
    return seed;
  }

  try {
    const fromFile = await readEmissorasFromFile();
    if (fromFile) return sincronizarEmissorasComSeed(fromFile);
    return await readBundledSeedEmissoras();
  } catch {
    return await readBundledSeedEmissoras();
  }
}

export async function writeEmissoras(data: EmissorasData): Promise<void> {
  await mkdir(getDataDir(), { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(data, null, 2) + "\n", "utf-8");

  if (isDatabaseConfigured()) {
    await writeEmissorasToDb(data);
  }

  setEmissorasCache(data);
}

export async function readMunicipios(uf: string = UF_PADRAO): Promise<string[]> {
  const geoRel = geoPathForUf(uf).replace(/^\//, "");
  const geoFile = path.join(process.cwd(), "public", geoRel);
  const raw = await readFile(geoFile, "utf-8");
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

function isHorarioOpcionalOk(valor: unknown): boolean {
  if (valor === undefined || valor === "") return true;
  return typeof valor === "string" && /^([01]\d|2[0-3]):([0-5]\d)$/.test(valor.trim());
}

function isValidRadio(radio: Radio): boolean {
  const streamOk =
    radio.streamUrl === undefined ||
    (typeof radio.streamUrl === "string" &&
      (radio.streamUrl.trim() === "" || isValidStreamUrl(radio.streamUrl)));

  const faixaOk = isHorarioOpcionalOk(radio.gravarInicio) && isHorarioOpcionalOk(radio.gravarFim);

  return (
    typeof radio.nome === "string" &&
    radio.nome.trim().length > 0 &&
    typeof radio.pj === "number" &&
    radio.pj >= 0 &&
    (radio.tipo === "comercial" || radio.tipo === "comunitaria") &&
    (radio.gravar === undefined || typeof radio.gravar === "boolean") &&
    faixaOk &&
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
