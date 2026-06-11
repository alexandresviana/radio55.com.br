import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getTrechosDir } from "@/lib/data-dir";
import { obterDeteccaoPorId } from "@/lib/deteccoes-db";

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

  const deteccao = await obterDeteccaoPorId(id);
  if (!deteccao?.trecho_caminho) {
    return new NextResponse("Trecho não disponível", { status: 404 });
  }

  const trechosRoot = path.resolve(getTrechosDir());
  const resolved = path.resolve(deteccao.trecho_caminho);

  if (!resolved.startsWith(trechosRoot + path.sep)) {
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
      "Content-Disposition": `inline; filename="trecho-${id}.mp3"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
