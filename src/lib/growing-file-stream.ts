import { createReadStream } from "node:fs";
import { open, stat } from "node:fs/promises";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getActiveRecordingPaths } from "@/lib/recorder";

const CHUNK_SIZE = 64 * 1024;
const POLL_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isFileStillRecording(filePath: string): boolean {
  return getActiveRecordingPaths().has(filePath);
}

function parseRangeStart(rangeHeader: string | null): number | null {
  if (!rangeHeader) return null;
  const match = rangeHeader.match(/^bytes=(\d+)-/);
  if (!match) return null;
  return Number(match[1]);
}

export function createGrowingFileWebStream(
  filePath: string,
  startOffset = 0,
): ReadableStream<Uint8Array> {
  let offset = startOffset;
  let cancelled = false;

  return new ReadableStream({
    async pull(controller) {
      while (!cancelled) {
        let size: number;
        try {
          size = (await stat(filePath)).size;
        } catch {
          controller.error(new Error("Arquivo não encontrado"));
          return;
        }

        if (size > offset) {
          const length = Math.min(CHUNK_SIZE, size - offset);
          const handle = await open(filePath, "r");
          try {
            const buffer = Buffer.alloc(length);
            const { bytesRead } = await handle.read(buffer, 0, length, offset);
            if (bytesRead > 0) {
              offset += bytesRead;
              controller.enqueue(new Uint8Array(buffer.subarray(0, bytesRead)));
            }
          } finally {
            await handle.close();
          }
          return;
        }

        if (!isFileStillRecording(filePath)) {
          controller.close();
          return;
        }

        await sleep(POLL_MS);
      }
    },
    cancel() {
      cancelled = true;
    },
  });
}

export async function serveGrowingFile(
  filePath: string,
  filename: string,
  request: NextRequest,
): Promise<NextResponse> {
  const rangeStart = parseRangeStart(request.headers.get("range")) ?? 0;
  const fileStat = await stat(filePath);

  const headers: Record<string, string> = {
    "Content-Type": "audio/mpeg",
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "Content-Disposition": `inline; filename="${filename}"`,
    "X-Content-Type-Options": "nosniff",
  };

  if (request.headers.get("range")) {
    const end = Math.max(fileStat.size - 1, rangeStart);
    headers["Content-Range"] = `bytes ${rangeStart}-${end}/*`;
    headers["Accept-Ranges"] = "bytes";
    return new NextResponse(createGrowingFileWebStream(filePath, rangeStart), {
      status: 206,
      headers,
    });
  }

  return new NextResponse(createGrowingFileWebStream(filePath, rangeStart), {
    headers,
  });
}

export async function serveCompleteFile(
  filePath: string,
  filename: string,
  request: NextRequest,
): Promise<NextResponse> {
  const fileStat = await stat(filePath);
  const rangeHeader = request.headers.get("range");

  if (rangeHeader) {
    const match = rangeHeader.match(/^bytes=(\d+)-(\d*)$/);
    if (match) {
      const start = Number(match[1]);
      const end = match[2] ? Number(match[2]) : fileStat.size - 1;

      if (start >= fileStat.size || start > end) {
        return new NextResponse(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${fileStat.size}` },
        });
      }

      const chunkSize = end - start + 1;
      const stream = createReadStream(filePath, { start, end });

      return new NextResponse(stream as unknown as ReadableStream, {
        status: 206,
        headers: {
          "Content-Type": "audio/mpeg",
          "Content-Length": String(chunkSize),
          "Content-Range": `bytes ${start}-${end}/${fileStat.size}`,
          "Accept-Ranges": "bytes",
          "Content-Disposition": `inline; filename="${filename}"`,
          "Cache-Control": "private, max-age=3600",
        },
      });
    }
  }

  const stream = createReadStream(filePath);

  return new NextResponse(stream as unknown as ReadableStream, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(fileStat.size),
      "Accept-Ranges": "bytes",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
