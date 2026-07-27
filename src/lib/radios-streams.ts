import { readFile } from "fs/promises";
import path from "path";
import { readEmissoras } from "@/lib/emissoras";
import type { RadioStreamInfo } from "@/types";

type StreamsData = Record<string, RadioStreamInfo>;

const DATA_FILE = path.join(process.cwd(), "data/radios-streams.json");

export function makeStreamKey(municipio: string, nome: string, estado = "SE"): string {
  return `${estado}|${municipio}|${nome}`;
}

export async function readRadioStreams(): Promise<StreamsData> {
  const raw = await readFile(DATA_FILE, "utf-8");
  return JSON.parse(raw) as StreamsData;
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
  const entry =
    data[makeStreamKey(municipio, nome, uf)] ??
    data[makeStreamKey(municipio, nome)] ??
    data[`${municipio}|${nome}`];
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
    return `/api/radio-stream/play?${params}`;
  }

  return normalized;
}
