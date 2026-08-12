import { spawn } from "node:child_process";
import { FFMPEG_LIVE_INPUT_FLAGS } from "@/lib/ffmpeg-audio";

/** Icecast/Shoutcast: sem blocos ICY embutidos no áudio (melhor para gravar e para HTML5). */
export const ICECAST_HTTP_HEADERS =
  "Icy-MetaData: 0\r\nAccept: */*\r\nConnection: keep-alive\r\n";

const PROBE_TIMEOUT_US = 12_000_000;

const MP3_CODECS = new Set(["mp3", "mp3float", "mp3adu", "mp3on4"]);

export function isMp3AudioCodec(codec: string | null | undefined): boolean {
  return !!codec && MP3_CODECS.has(codec.trim().toLowerCase());
}

/** 96 kbps CBR — usado quando reencodamos com lame. */
export const LAME_96K_BYTES_PER_SECOND = 12_000;

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
): Promise<{ ok: boolean; codec: string | null; bitRate: number | null; error: string | null }> {
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
    "stream=codec_name,bit_rate",
    "-select_streams",
    "a:0",
    "-of",
    "json",
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
      const parsed = parseProbeJson(stdout);

      if (code === 0 && parsed.codec) {
        resolve({ ok: true, codec: parsed.codec, bitRate: parsed.bitRate, error: null });
        return;
      }

      resolve({
        ok: false,
        codec: parsed.codec,
        bitRate: parsed.bitRate,
        error: (stderr || stdout).trim().slice(-200) || "Stream inacessível",
      });
    });

    proc.on("error", () => {
      clearTimeout(timer);
      resolve({ ok: false, codec: null, bitRate: null, error: "ffprobe indisponível" });
    });
  });
}

function parseProbeJson(stdout: string): { codec: string | null; bitRate: number | null } {
  try {
    const data = JSON.parse(stdout) as {
      streams?: { codec_name?: string; bit_rate?: string | number }[];
    };
    const stream = data.streams?.[0];
    const codec = stream?.codec_name?.trim() || null;
    const raw = stream?.bit_rate;
    const bitRate = typeof raw === "number" ? raw : Number(raw);
    return {
      codec,
      bitRate: Number.isFinite(bitRate) && bitRate > 0 ? bitRate : null,
    };
  } catch {
    return { codec: null, bitRate: null };
  }
}

export function buildRecordingAudioOutputArgs(probe: {
  codec: string | null;
  bitRate: number | null;
}): { args: string[]; bytesPerSecond: number; copy: boolean } {
  if (isMp3AudioCodec(probe.codec)) {
    const fromProbe =
      probe.bitRate && probe.bitRate > 0 ? Math.ceil(probe.bitRate / 8) : 16_000;
    return {
      copy: true,
      bytesPerSecond: Math.min(24_000, Math.max(8_000, fromProbe)),
      args: ["-map", "0:a:0?", "-c:a", "copy", "-flush_packets", "1", "-f", "mp3"],
    };
  }

  return {
    copy: false,
    bytesPerSecond: LAME_96K_BYTES_PER_SECOND,
    args: [
      "-map",
      "0:a:0?",
      "-threads",
      "1",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "96k",
      "-ar",
      "44100",
      "-ac",
      "2",
      "-write_xing",
      "0",
      "-id3v2_version",
      "3",
      "-flush_packets",
      "1",
      "-f",
      "mp3",
    ],
  };
}
