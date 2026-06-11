import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getGravacoesDir } from "@/lib/data-dir";
import { obterGravacaoPorId } from "@/lib/gravacoes-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
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

  let fileStat;
  try {
    fileStat = await stat(resolved);
  } catch {
    return new NextResponse("Arquivo não existe no disco", { status: 404 });
  }

  const stream = createReadStream(resolved);

  return new NextResponse(stream as unknown as ReadableStream, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(fileStat.size),
      "Content-Disposition": `inline; filename="${gravacao.arquivo}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
