import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

/** Flags para streams ao vivo (AAC/icecast) com pacotes corrompidos ocasionais. */
export const FFMPEG_LIVE_INPUT_FLAGS = [
  "-fflags",
  "+discardcorrupt+genpts",
  "-err_detect",
  "ignore_err",
  "-max_error_rate",
  "1.0",
  "-thread_queue_size",
  "512",
];

/** Flags para ler MP3 local (inclusive arquivo ainda crescendo). */
export const FFMPEG_FILE_INPUT_FLAGS = ["-fflags", "+discardcorrupt+genpts"];

const BENIGN_FFMPEG_PATTERNS =
  /channel element.*not allocated|invalid data found when processing input|discarding invalid/i;

export function isBenignFfmpegMessage(message: string): boolean {
  return BENIGN_FFMPEG_PATTERNS.test(message);
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";

    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("error", reject);
    proc.on("exit", (code) => {
      if (code === 0) resolve();
      else {
        const trimmed = stderr.trim();
        const lines = trimmed.split("\n").filter((line) => !isBenignFfmpegMessage(line));
        const relevant = lines.join("\n").trim().slice(-300);
        if (relevant) reject(new Error(relevant));
        else resolve();
      }
    });
  });
}

export async function extractWavSegment(
  inputPath: string,
  startSeconds: number,
  durationSeconds: number,
  outputPath: string,
): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true });

  await runFfmpeg([
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    ...FFMPEG_FILE_INPUT_FLAGS,
    "-ss",
    String(Math.max(0, startSeconds)),
    "-i",
    inputPath,
    "-t",
    String(durationSeconds),
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "pcm_s16le",
    outputPath,
  ]);
}

export async function extractMp3Clip(
  inputPath: string,
  centerSeconds: number,
  outputPath: string,
  clipSeconds = 25,
  preSeconds = 10,
): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true });

  const start = Math.max(0, centerSeconds - preSeconds);

  await runFfmpeg([
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    ...FFMPEG_FILE_INPUT_FLAGS,
    "-ss",
    String(start),
    "-i",
    inputPath,
    "-t",
    String(clipSeconds),
    "-c:a",
    "libmp3lame",
    "-b:a",
    "96k",
    outputPath,
  ]);
}

export function streamMp3FromSeconds(inputPath: string, startSeconds: number): Readable {
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    ...FFMPEG_FILE_INPUT_FLAGS,
    "-ss",
    String(Math.max(0, startSeconds)),
    "-i",
    inputPath,
    "-c:a",
    "libmp3lame",
    "-b:a",
    "96k",
    "-f",
    "mp3",
    "pipe:1",
  ];

  const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });

  proc.stderr?.on("data", () => {});

  proc.on("error", () => {
    proc.stdout?.destroy();
  });

  return proc.stdout ?? Readable.from([]);
}
