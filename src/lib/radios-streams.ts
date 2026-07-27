import { access, readFile } from "fs/promises";
import path from "path";
import { getDataDir } from "@/lib/data-dir";
import { readEmissoras } from "@/lib/emissoras";
import type { RadioStreamInfo } from "@/types";

type StreamsData = Record<string, RadioStreamInfo>;

const BUNDLED_STREAM_PATHS = [
  "/app/data-seed/radios-streams.json",
  path.join(process.cwd(), "data/radios-streams.json"),
];

const RUNTIME_STREAM_PATH = path.join(getDataDir(), "radios-streams.json");

export function makeStreamKey(municipio: string, nome: string, estado = "SE"): string {
  return `${estado}|${municipio}|${nome}`;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readStreamsFromPath(filePath: string): Promise<StreamsData | null> {
  if (!(await fileExists(filePath))) return null;
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw) as StreamsData;
}

function mergeStreams(base: StreamsData, overlay: StreamsData): StreamsData {
  return { ...base, ...overlay };
}

export async function readRadioStreams(): Promise<StreamsData> {
  let merged: StreamsData = {};

  for (const seedPath of BUNDLED_STREAM_PATHS) {
    const data = await readStreamsFromPath(seedPath);
    if (data) {
      merged = mergeStreams(merged, data);
      break;
    }
  }

  const runtime = await readStreamsFromPath(RUNTIME_STREAM_PATH);
  if (runtime) {
    merged = mergeStreams(merged, runtime);
  }

  if (Object.keys(merged).length === 0) {
    throw new Error("Nenhum arquivo radios-streams.json encontrado");
  }

  return merged;
}

function lookupStream(
  data: StreamsData,
  municipio: string,
  nome: string,
  estado: string,
): RadioStreamInfo | null {
  return (
    data[makeStreamKey(municipio, nome, estado)] ??
    data[makeStreamKey(municipio, nome, "SE")] ??
    data[makeStreamKey(municipio, nome, "BA")] ??
    data[`${municipio}|${nome}`] ??
    null
  );
}

export async function getRadioStream(
  municipio: string,
  nome: string,
  estado = "SE",
): Promise<RadioStreamInfo | null> {
  const emissoras = await readEmissoras();
  const municipioData = emissoras[municipio];
  const uf = municipioData?.estado ?? estado;
  const radio = municipioData?.radios.find((item) => item.nome === nome);
  const customUrl = radio?.streamUrl?.trim();

  if (customUrl) {
    return {
      estado: uf,
      municipio,
      nome,
      radiosId: 0,
      radiosUrl: "",
      title: nome,
      streamUrl: normalizeStreamUrl(customUrl),
    };
  }

  const data = await readRadioStreams();
  const entry = lookupStream(data, municipio, nome, uf);
  if (!entry) return null;

  return {
    ...entry,
    streamUrl: entry.streamUrl ? normalizeStreamUrl(entry.streamUrl) : null,
  };
}

export function normalizeStreamUrl(url: string): string {
  let normalized = url.trim().replace(/;+$/, "");

  if (normalized.endsWith("/stream/")) {
    normalized = normalized.slice(0, -1);
  } else if (/^https?:\/\/[^/?#]+(?::\d+)?\/?$/.test(normalized)) {
    normalized = normalized.replace(/\/?$/, "/stream");
  }

  return normalized;
}

export function buildPlayUrl(
  streamUrl: string | null,
  municipio: string,
  nome: string,
): string | null {
  if (!streamUrl) return null;

  const normalized = normalizeStreamUrl(streamUrl);

  if (normalized.startsWith("https://")) {
    return normalized;
  }

  if (normalized.startsWith("http://")) {
    const params = new URLSearchParams({ municipio, nome });
    return `/api/radio-stream/play?${params.toString()}`;
  }

  return normalized;
}
