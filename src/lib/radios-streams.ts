import { readFile } from "fs/promises";
import path from "path";

export interface RadioStreamInfo {
  municipio: string;
  nome: string;
  radiosId: number;
  radiosUrl: string;
  title: string;
  streamUrl: string | null;
}

type StreamsData = Record<string, RadioStreamInfo>;

const DATA_FILE = path.join(process.cwd(), "data/radios-streams.json");

export function makeStreamKey(municipio: string, nome: string): string {
  return `${municipio}|${nome}`;
}

export async function readRadioStreams(): Promise<StreamsData> {
  const raw = await readFile(DATA_FILE, "utf-8");
  return JSON.parse(raw) as StreamsData;
}

export async function getRadioStream(
  municipio: string,
  nome: string,
): Promise<RadioStreamInfo | null> {
  const data = await readRadioStreams();
  const entry = data[makeStreamKey(municipio, nome)];
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
