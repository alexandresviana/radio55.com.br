import { access, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import {
  buildBunnyStorageApiUrl,
  getBunnyStorageConfig,
  isBunnyStorageConfigured,
} from "@/lib/bunny-storage";
import { getGravacoesDir, getTrechosDir } from "@/lib/data-dir";
import {
  atualizarTrechoDeteccao,
  limparTrechoCaminho,
  listarDeteccoesComTrecho,
  type PalavraDeteccao,
} from "@/lib/deteccoes-db";
import { extractMp3Clip } from "@/lib/ffmpeg-audio";
import { obterGravacaoPorId, type GravacaoArquivo } from "@/lib/gravacoes-db";

async function arquivoExiste(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function resolveGravacaoAudioSource(
  gravacao: GravacaoArquivo,
): Promise<{ inputPath: string; httpHeaders?: string } | null> {
  const gravacoesRoot = path.resolve(getGravacoesDir());
  const localPath = path.resolve(gravacao.caminho);

  if (localPath.startsWith(gravacoesRoot + path.sep)) {
    try {
      await access(localPath);
      return { inputPath: localPath };
    } catch {
      // tenta Bunny abaixo
    }
  }

  if (gravacao.bunny_path && gravacao.bunny_uploaded_em && isBunnyStorageConfigured()) {
    const url = buildBunnyStorageApiUrl(gravacao.bunny_path);
    if (!url) return null;

    const config = getBunnyStorageConfig();
    return {
      inputPath: url,
      httpHeaders: config ? `AccessKey: ${config.accessKey}\r\n` : undefined,
    };
  }

  return null;
}

function caminhoTrechoCanonico(id: number): string {
  return path.join(getTrechosDir(), `${id}.mp3`);
}

export async function ensureTrechoFile(deteccao: PalavraDeteccao): Promise<string | null> {
  const trechosRoot = path.resolve(getTrechosDir());
  await mkdir(trechosRoot, { recursive: true });

  const canonicalPath = caminhoTrechoCanonico(deteccao.id);
  const candidatos = new Set<string>([canonicalPath]);

  if (deteccao.trecho_caminho) {
    const stored = path.resolve(deteccao.trecho_caminho);
    if (stored.startsWith(trechosRoot + path.sep)) {
      candidatos.add(stored);
    }
  }

  for (const candidato of candidatos) {
    if (await arquivoExiste(candidato)) {
      return candidato;
    }
  }

  const gravacao = await obterGravacaoPorId(deteccao.gravacao_id);
  if (!gravacao || gravacao.arquivo_valido === false) {
    return null;
  }

  const source = await resolveGravacaoAudioSource(gravacao);
  if (!source) {
    return null;
  }

  try {
    await extractMp3Clip(
      source.inputPath,
      deteccao.inicio_segundos,
      canonicalPath,
      25,
      10,
      source.httpHeaders,
    );
    await atualizarTrechoDeteccao(deteccao.id, canonicalPath);
    return canonicalPath;
  } catch (error) {
    console.error("[trecho] Falha ao regenerar trecho:", deteccao.id, error);
    return null;
  }
}

function trechoPathValido(trechoCaminho: string, trechosRoot: string): string | null {
  const resolved = path.resolve(trechoCaminho);
  if (!resolved.startsWith(trechosRoot + path.sep)) {
    return null;
  }
  return resolved;
}

export async function limparTrechosInexistentes(): Promise<{
  verificados: number;
  limpos: number;
}> {
  const trechosRoot = path.resolve(getTrechosDir());
  const registros = await listarDeteccoesComTrecho();
  let limpos = 0;

  for (const registro of registros) {
    const resolved = trechoPathValido(registro.trecho_caminho, trechosRoot);
    const existe = resolved ? await arquivoExiste(resolved) : false;

    if (!existe) {
      await limparTrechoCaminho(registro.id);
      limpos++;
    }
  }

  if (limpos > 0) {
    console.log(
      `[trecho] Limpeza: ${limpos} de ${registros.length} registro(s) sem arquivo no disco`,
    );
  }

  return { verificados: registros.length, limpos };
}
