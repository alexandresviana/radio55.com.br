import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { obterDeteccaoPorId } from "@/lib/deteccoes-db";
import { ensureTrechoFile } from "@/lib/trecho-deteccao";

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
  if (!deteccao) {
    return new NextResponse("Detecção não encontrada", { status: 404 });
  }

  const trechoPath = await ensureTrechoFile(deteccao);
  if (!trechoPath) {
    return new NextResponse(
      deteccao.trecho_caminho
        ? "Trecho não encontrado — gravação original indisponível para recorte"
        : "Trecho não disponível",
      { status: 404 },
    );
  }

  const fileStat = await stat(trechoPath);
  const stream = createReadStream(trechoPath);

  return new NextResponse(stream as unknown as ReadableStream, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(fileStat.size),
      "Content-Disposition": `inline; filename="trecho-${id}.mp3"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
