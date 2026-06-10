import http from "node:http";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { getRadioStream } from "@/lib/radios-streams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const municipio = request.nextUrl.searchParams.get("municipio");
  const nome = request.nextUrl.searchParams.get("nome");

  if (!municipio || !nome) {
    return new NextResponse("Parâmetros inválidos", { status: 400 });
  }

  const info = await getRadioStream(municipio, nome);
  if (!info?.streamUrl) {
    return new NextResponse("Stream não disponível", { status: 404 });
  }

  if (!info.streamUrl.startsWith("http://")) {
    return new NextResponse("Use a URL direta para streams HTTPS", { status: 400 });
  }

  return new Promise<NextResponse>((resolve) => {
    const upstream = http.get(
      info.streamUrl!,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; radio55/1.0)",
          Accept: "*/*",
          "Icy-MetaData": "1",
        },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          res.resume();
          resolve(new NextResponse("Falha ao conectar na emissora", { status: 502 }));
          return;
        }

        const contentType = res.headers["content-type"] ?? "audio/mpeg";
        const type = Array.isArray(contentType) ? contentType[0] : contentType;

        resolve(
          new NextResponse(Readable.toWeb(res) as ReadableStream, {
            headers: {
              "Content-Type": type,
              "Cache-Control": "no-cache, no-store",
              "Access-Control-Allow-Origin": "*",
            },
          }),
        );
      },
    );

    upstream.on("error", () => {
      resolve(new NextResponse("Erro ao reproduzir stream", { status: 502 }));
    });
  });
}
