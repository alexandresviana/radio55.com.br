import { access } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import {
  fetchFileFromBunnyStorage,
  getBunnyCdnUrl,
  getBunnyStorageConfig,
  isBunnyStorageConfigured,
  buildBunnyStorageApiUrl,
} from "@/lib/bunny-storage";
import { getGravacoesDir } from "@/lib/data-dir";
import { streamMp3FromSeconds } from "@/lib/ffmpeg-audio";
import { obterGravacaoPorId } from "@/lib/gravacoes-db";
import {
  isFileStillRecording,
  serveCompleteFile,
  serveGrowingFile,
} from "@/lib/growing-file-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function arquivoLocalExiste(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function bunnyFfmpegHeaders(): string | undefined {
  const config = getBunnyStorageConfig();
  if (!config) return undefined;
  return `AccessKey: ${config.accessKey}\r\n`;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: idParam } = await context.params;
  const id = Number(idParam);

  if (!Number.isFinite(id)) {
    return new NextResponse("ID inválido", { status: 400 });
  }

  const gravacao = await obterGravacaoPorId(id);
  if (!gravacao) {
    return new NextResponse("Arquivo não encontrado", { status: 404 });
  }

  if (gravacao.arquivo_valido === false) {
    return new NextResponse(gravacao.arquivo_erro ?? "Arquivo MP3 inválido ou truncado", {
      status: 422,
    });
  }

  const gravacoesRoot = path.resolve(getGravacoesDir());
  const resolved = path.resolve(gravacao.caminho);

  if (!resolved.startsWith(gravacoesRoot + path.sep)) {
    return new NextResponse("Caminho inválido", { status: 400 });
  }

  const temLocal = await arquivoLocalExiste(resolved);
  const temStorage = Boolean(gravacao.bunny_path && gravacao.bunny_uploaded_em);

  const startAt = Number(request.nextUrl.searchParams.get("t"));
  const querSeek = Number.isFinite(startAt) && startAt > 0;

  if (temLocal) {
    const aoVivo = gravacao.em_gravacao || isFileStillRecording(resolved);

    if (querSeek) {
      const stream = streamMp3FromSeconds(resolved, startAt);
      return new NextResponse(stream as unknown as ReadableStream, {
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "no-store",
          "Content-Disposition": `inline; filename="${gravacao.arquivo}"`,
        },
      });
    }

    if (aoVivo) {
      return serveGrowingFile(resolved, gravacao.arquivo, request);
    }

    return serveCompleteFile(resolved, gravacao.arquivo, request);
  }

  if (!temStorage || !isBunnyStorageConfigured() || !gravacao.bunny_path) {
    return new NextResponse(
      gravacao.em_gravacao
        ? "Gravação em andamento — arquivo ainda não disponível"
        : "Arquivo aguardando envio ao Bunny Storage ou não existe no disco",
      { status: 404 },
    );
  }

  if (querSeek) {
    const storageUrl = buildBunnyStorageApiUrl(gravacao.bunny_path);
    if (!storageUrl) {
      return new NextResponse("Storage não configurado", { status: 503 });
    }

    const stream = streamMp3FromSeconds(storageUrl, startAt, bunnyFfmpegHeaders());
    return new NextResponse(stream as unknown as ReadableStream, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "Content-Disposition": `inline; filename="${gravacao.arquivo}"`,
      },
    });
  }

  const cdnUrl = getBunnyCdnUrl(gravacao.bunny_path);
  if (cdnUrl && !request.headers.get("range")) {
    return NextResponse.redirect(cdnUrl, 302);
  }

  try {
    const upstream = await fetchFileFromBunnyStorage(
      gravacao.bunny_path,
      request.headers.get("range"),
    );

    const headers: Record<string, string> = {
      "Content-Type": upstream.headers.get("content-type") ?? "audio/mpeg",
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `inline; filename="${gravacao.arquivo}"`,
      "Accept-Ranges": "bytes",
    };

    const contentLength = upstream.headers.get("content-length");
    const contentRange = upstream.headers.get("content-range");
    if (contentLength) headers["Content-Length"] = contentLength;
    if (contentRange) headers["Content-Range"] = contentRange;

    return new NextResponse(upstream.body, {
      status: upstream.status === 206 ? 206 : 200,
      headers,
    });
  } catch (error) {
    return new NextResponse(
      error instanceof Error ? error.message : "Erro ao ler arquivo no storage",
      { status: 502 },
    );
  }
}
