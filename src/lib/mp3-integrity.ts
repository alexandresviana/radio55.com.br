import { spawn } from "node:child_process";
import { rename, stat, unlink } from "node:fs/promises";
import { FFMPEG_FILE_INPUT_FLAGS } from "@/lib/ffmpeg-audio";

export const MIN_PLAYABLE_MP3_BYTES = 64 * 1024;

export interface Mp3ValidationResult {
  ok: boolean;
  repaired: boolean;
  sizeBytes: number;
  durationSeconds: number | null;
  error: string | null;
}

function runCommand(
  command: string,
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("error", reject);
    proc.on("exit", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

export async function probeMp3Duration(filePath: string): Promise<number | null> {
  const result = await runCommand("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);

  if (result.code !== 0) return null;

  const duration = Number(result.stdout.trim());
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

async function repairMp3ToTemp(inputPath: string, outputPath: string): Promise<boolean> {
  const copyResult = await runCommand("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    ...FFMPEG_FILE_INPUT_FLAGS,
    "-i",
    inputPath,
    "-c:a",
    "copy",
    "-f",
    "mp3",
    outputPath,
  ]);

  if (copyResult.code === 0) {
    const duration = await probeMp3Duration(outputPath);
    if (duration && duration > 1) return true;
  }

  await unlink(outputPath).catch(() => {});

  const reencodeResult = await runCommand("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    ...FFMPEG_FILE_INPUT_FLAGS,
    "-err_detect",
    "ignore_err",
    "-i",
    inputPath,
    "-c:a",
    "libmp3lame",
    "-b:a",
    "96k",
    "-ar",
    "44100",
    "-ac",
    "2",
    "-f",
    "mp3",
    outputPath,
  ]);

  if (reencodeResult.code !== 0) return false;

  const duration = await probeMp3Duration(outputPath);
  return Boolean(duration && duration > 1);
}

export async function validateAndRepairMp3(filePath: string): Promise<Mp3ValidationResult> {
  let sizeBytes = 0;

  try {
    sizeBytes = (await stat(filePath)).size;
  } catch {
    return {
      ok: false,
      repaired: false,
      sizeBytes: 0,
      durationSeconds: null,
      error: "Arquivo não encontrado",
    };
  }

  if (sizeBytes < MIN_PLAYABLE_MP3_BYTES) {
    return {
      ok: false,
      repaired: false,
      sizeBytes,
      durationSeconds: null,
      error: `Arquivo muito pequeno (${sizeBytes} bytes)`,
    };
  }

  let duration = await probeMp3Duration(filePath);
  if (duration && duration > 1) {
    return {
      ok: true,
      repaired: false,
      sizeBytes,
      durationSeconds: duration,
      error: null,
    };
  }

  const tempPath = `${filePath}.repair-${Date.now()}.mp3`;
  const repaired = await repairMp3ToTemp(filePath, tempPath);

  if (!repaired) {
    await unlink(tempPath).catch(() => {});
    return {
      ok: false,
      repaired: false,
      sizeBytes,
      durationSeconds: null,
      error: "MP3 truncado ou ilegível — reparo falhou",
    };
  }

  try {
    await rename(tempPath, filePath);
    sizeBytes = (await stat(filePath)).size;
    duration = await probeMp3Duration(filePath);

    return {
      ok: Boolean(duration && duration > 1),
      repaired: true,
      sizeBytes,
      durationSeconds: duration,
      error: duration && duration > 1 ? null : "Reparo concluído mas duração inválida",
    };
  } catch (error) {
    await unlink(tempPath).catch(() => {});
    return {
      ok: false,
      repaired: false,
      sizeBytes,
      durationSeconds: null,
      error: error instanceof Error ? error.message : "Erro ao substituir arquivo reparado",
    };
  }
}
