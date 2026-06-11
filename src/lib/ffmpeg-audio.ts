import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

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
      else reject(new Error(stderr.trim().slice(-300) || `ffmpeg saiu com código ${code}`));
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
