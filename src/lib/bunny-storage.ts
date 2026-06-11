import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const REGION_HOSTS: Record<string, string> = {
  de: "storage.bunnycdn.com",
  falkenstein: "storage.bunnycdn.com",
  uk: "uk.storage.bunnycdn.com",
  london: "uk.storage.bunnycdn.com",
  ny: "ny.storage.bunnycdn.com",
  la: "la.storage.bunnycdn.com",
  sg: "sg.storage.bunnycdn.com",
  se: "se.storage.bunnycdn.com",
  br: "br.storage.bunnycdn.com",
  jh: "jh.storage.bunnycdn.com",
  syd: "syd.storage.bunnycdn.com",
};

export interface BunnyStorageConfig {
  zone: string;
  accessKey: string;
  host: string;
  pathPrefix: string;
}

export function isBunnyStorageConfigured(): boolean {
  if (process.env.BUNNY_STORAGE_ENABLED === "false") return false;
  return Boolean(
    process.env.BUNNY_STORAGE_ZONE?.trim() && process.env.BUNNY_STORAGE_ACCESS_KEY?.trim(),
  );
}

export function getBunnyStorageConfig(): BunnyStorageConfig | null {
  if (!isBunnyStorageConfigured()) return null;

  const region = (process.env.BUNNY_STORAGE_REGION ?? "de").trim().toLowerCase();
  const host = REGION_HOSTS[region] ?? process.env.BUNNY_STORAGE_HOST?.trim() ?? "storage.bunnycdn.com";

  return {
    zone: process.env.BUNNY_STORAGE_ZONE!.trim(),
    accessKey: process.env.BUNNY_STORAGE_ACCESS_KEY!.trim(),
    host,
    pathPrefix: (process.env.BUNNY_STORAGE_PATH_PREFIX ?? "radio55/gravacoes")
      .trim()
      .replace(/^\/+|\/+$/g, ""),
  };
}

export function buildBunnyRemotePath(parts: string[]): string {
  return parts
    .map((part) =>
      part
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9._-]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 120) || "item",
    )
    .join("/");
}

export async function uploadFileToBunnyStorage(input: {
  localPath: string;
  remotePath: string;
}): Promise<{ remotePath: string; checksum: string; sizeBytes: number }> {
  const config = getBunnyStorageConfig();
  if (!config) {
    throw new Error("Bunny Storage não configurado");
  }

  const fileBuffer = await readFile(input.localPath);
  const checksum = createHash("sha256").update(fileBuffer).digest("hex").toUpperCase();
  const segments = input.remotePath.split("/").filter(Boolean);
  const fileName = segments.pop();
  if (!fileName) {
    throw new Error("Caminho remoto inválido");
  }

  const directory = segments.map((segment) => encodeURIComponent(segment)).join("/");
  const encodedFileName = encodeURIComponent(fileName);
  const url = directory
    ? `https://${config.host}/${encodeURIComponent(config.zone)}/${directory}/${encodedFileName}`
    : `https://${config.host}/${encodeURIComponent(config.zone)}/${encodedFileName}`;

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      AccessKey: config.accessKey,
      "Content-Type": "audio/mpeg",
      Checksum: checksum,
    },
    body: fileBuffer,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Upload Bunny Storage falhou (${response.status})${body ? `: ${body.slice(0, 200)}` : ""}`,
    );
  }

  return {
    remotePath: input.remotePath,
    checksum,
    sizeBytes: fileBuffer.byteLength,
  };
}
