import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { getGravacoesDir, getTrechosDir } from "@/lib/data-dir";
import { getPool, isDatabaseConfigured } from "@/lib/db";
import {
  buildBunnyStorageApiUrl,
  getBunnyStorageConfig,
  isBunnyStorageConfigured,
} from "@/lib/bunny-storage";

async function esvaziarDiretorio(dir: string): Promise<number> {
  await mkdir(dir, { recursive: true });
  let removidos = 0;

  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    await rm(full, { recursive: true, force: true });
    removidos += 1;
  }

  return removidos;
}

async function listarBunnyPaths(): Promise<string[]> {
  if (!isDatabaseConfigured()) return [];

  const result = await getPool().query<{ bunny_path: string }>(
    `SELECT bunny_path
     FROM gravacao_arquivos
     WHERE bunny_path IS NOT NULL AND bunny_path <> ''`,
  );

  return result.rows.map((row) => row.bunny_path);
}

async function apagarNoBunny(remotePath: string): Promise<boolean> {
  const config = getBunnyStorageConfig();
  const url = buildBunnyStorageApiUrl(remotePath);
  if (!config || !url) return false;

  const response = await fetch(url, {
    method: "DELETE",
    headers: { AccessKey: config.accessKey },
  });

  // 404 = já não existe
  return response.ok || response.status === 404;
}

export async function limparArquivosMonitoramento(): Promise<{
  gravacoesLocais: number;
  trechosLocais: number;
  bunnyRemotos: number;
  bunnyFalhas: number;
}> {
  const bunnyPaths = await listarBunnyPaths();

  let bunnyRemotos = 0;
  let bunnyFalhas = 0;

  if (isBunnyStorageConfigured() && bunnyPaths.length > 0) {
    for (const remotePath of bunnyPaths) {
      try {
        const ok = await apagarNoBunny(remotePath);
        if (ok) bunnyRemotos += 1;
        else bunnyFalhas += 1;
      } catch {
        bunnyFalhas += 1;
      }
    }
  }

  const gravacoesDir = getGravacoesDir();
  const trechosDir = getTrechosDir();

  // Garante que são pastas esperadas antes de apagar conteúdo
  for (const dir of [gravacoesDir, trechosDir]) {
    const info = await stat(dir).catch(() => null);
    if (info && !info.isDirectory()) {
      throw new Error(`Caminho de limpeza não é diretório: ${dir}`);
    }
  }

  const gravacoesLocais = await esvaziarDiretorio(gravacoesDir);
  const trechosLocais = await esvaziarDiretorio(trechosDir);

  console.warn("[arquivos] Monitoramento limpo:", {
    gravacoesLocais,
    trechosLocais,
    bunnyRemotos,
    bunnyFalhas,
  });

  return { gravacoesLocais, trechosLocais, bunnyRemotos, bunnyFalhas };
}
