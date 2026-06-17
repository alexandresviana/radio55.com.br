import { spawn } from "node:child_process";
import { FFMPEG_LIVE_INPUT_FLAGS } from "@/lib/ffmpeg-audio";

/** Icecast/Shoutcast: sem blocos ICY embutidos no áudio (melhor para gravar e para HTML5). */
export const ICECAST_HTTP_HEADERS =
  "Icy-MetaData: 0\r\nAccept: */*\r\nConnection: keep-alive\r\n";

const PROBE_TIMEOUT_US = 12_000_000;

export function buildFfmpegStreamInputArgs(streamUrl: string): string[] {
  const args = [
    "-user_agent",
    "Mozilla/5.0 (compatible; radio55-recorder/1.0; Icecast)",
    "-headers",
    ICECAST_HTTP_HEADERS,
    "-reconnect",
    "1",
    "-reconnect_at_eof",
    "1",
    "-reconnect_streamed",
    "1",
    "-reconnect_delay_max",
    "30",
    "-rw_timeout",
    "30000000",
  ];

  if (streamUrl.startsWith("https://")) {
    args.push("-tls_verify", "0");
  }

  args.push(...FFMPEG_LIVE_INPUT_FLAGS, "-i", streamUrl);
  return args;
}

export async function probeStreamUrl(
  streamUrl: string,
): Promise<{ ok: boolean; codec: string | null; error: string | null }> {
  const args = [
    "-v",
    "error",
    "-rw_timeout",
    String(PROBE_TIMEOUT_US),
    "-user_agent",
    "Mozilla/5.0 (compatible; radio55-recorder/1.0; Icecast)",
    "-headers",
    ICECAST_HTTP_HEADERS,
  ];

  if (streamUrl.startsWith("https://")) {
    args.push("-tls_verify", "0");
  }

  args.push(
    "-show_entries",
    "stream=codec_name",
    "-select_streams",
    "a:0",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    streamUrl,
  );

  return new Promise((resolve) => {
    const proc = spawn("ffprobe", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
    }, 15_000);

    proc.on("exit", (code) => {
      clearTimeout(timer);
      const codec = stdout.trim() || null;

      if (code === 0 && codec) {
        resolve({ ok: true, codec, error: null });
        return;
      }

      resolve({
        ok: false,
        codec: null,
        error: (stderr || stdout).trim().slice(-200) || "Stream inacessível",
      });
    });

    proc.on("error", () => {
      clearTimeout(timer);
      resolve({ ok: false, codec: null, error: "ffprobe indisponível" });
    });
  });
}
