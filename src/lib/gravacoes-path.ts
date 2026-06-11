import path from "node:path";
import { readEmissoras } from "@/lib/emissoras";
import { getGravacoesDir } from "@/lib/data-dir";

export function safeDirName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "radio";
}

export function radioOutputDir(municipio: string, nome: string): string {
  return path.join(getGravacoesDir(), safeDirName(municipio), safeDirName(nome));
}

export function parseMp3Timestamp(filename: string): Date | null {
  const match = filename.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.mp3$/);
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
}

export async function resolveRadioFromFilePath(
  filePath: string,
): Promise<{ municipio: string; nome: string } | null> {
  const rel = path.relative(getGravacoesDir(), filePath);
  const [municipioDir, radioDir] = rel.split(path.sep);
  if (!municipioDir || !radioDir) return null;

  const emissoras = await readEmissoras();

  for (const [municipio, data] of Object.entries(emissoras)) {
    if (safeDirName(municipio) !== municipioDir) continue;

    for (const radio of data.radios) {
      if (safeDirName(radio.nome) === radioDir) {
        return { municipio, nome: radio.nome };
      }
    }
  }

  return null;
}
