import { stat } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
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

  const gravacoesRoot = path.resolve(getGravacoesDir());
  const resolved = path.resolve(gravacao.caminho);

  if (!resolved.startsWith(gravacoesRoot + path.sep)) {
    return new NextResponse("Caminho inválido", { status: 400 });
  }

  try {
    await stat(resolved);
  } catch {
    return new NextResponse("Arquivo não existe no disco", { status: 404 });
  }

  const startAt = Number(request.nextUrl.searchParams.get("t"));
  if (Number.isFinite(startAt) && startAt > 0) {
    const stream = streamMp3FromSeconds(resolved, startAt);
    return new NextResponse(stream as unknown as ReadableStream, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "Content-Disposition": `inline; filename="${gravacao.arquivo}"`,
      },
    });
  }

  const aoVivo = gravacao.em_gravacao || isFileStillRecording(resolved);

  if (aoVivo) {
    return serveGrowingFile(resolved, gravacao.arquivo, request);
  }

  return serveCompleteFile(resolved, gravacao.arquivo, request);
}
