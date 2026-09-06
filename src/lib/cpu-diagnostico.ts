import { readdirSync, readFileSync } from "node:fs";
import { getTranscriptionStatus } from "@/lib/transcription";
import { getActiveRecordingDiagnostico } from "@/lib/recorder";

export type PapelFfmpeg =
  | "gravacao-copy"
  | "gravacao-lame"
  | "extracao-wav"
  | "trecho-mp3"
  | "outro";

export interface ProcessoDiagnostico {
  pid: number;
  tipo: "whisper" | "ffmpeg";
  papel: "whisper-worker" | PapelFfmpeg;
  rss_mb: number | null;
  cmd: string;
}

export interface DiagnosticoCpu {
  whisper_habilitado: boolean;
  whisper_modelo: string;
  whisper_threads: number;
  whisper_ativo: boolean;
  whisper_ocupado: boolean;
  whisper_worker_vivo: boolean;
  whisper_processos: number;
  ffmpeg_copy: number;
  ffmpeg_lame: number;
  ffmpeg_extracao: number;
  ffmpeg_outros: number;
  radios_marcadas: number;
  radios_gravando: number;
  alerta: string | null;
  processos: ProcessoDiagnostico[];
  gravacoes: ReturnType<typeof getActiveRecordingDiagnostico>["itens"];
}

function cmdLineOf(pid: number): string | null {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ").trim();
  } catch {
    return null;
  }
}

function rssMbOf(pid: number): number | null {
  try {
    const status = readFileSync(`/proc/${pid}/status`, "utf8");
    const match = status.match(/^VmRSS:\s+(\d+)\s+kB/m);
    if (!match) return null;
    return Math.round(Number(match[1]) / 1024);
  } catch {
    return null;
  }
}

function classificarFfmpeg(cmd: string): PapelFfmpeg {
  if (cmd.includes("pcm_s16le") || cmd.includes("16000")) return "extracao-wav";
  if (cmd.includes("radio55-recorder")) {
    return cmd.includes("libmp3lame") ? "gravacao-lame" : "gravacao-copy";
  }
  if (cmd.includes("libmp3lame")) return "trecho-mp3";
  if (cmd.includes("copy") && cmd.includes("mp3")) return "gravacao-copy";
  return "outro";
}

export function listarProcessosCpu(): ProcessoDiagnostico[] {
  let entries: string[];
  try {
    entries = readdirSync("/proc");
  } catch {
    return [];
  }

  const processos: ProcessoDiagnostico[] = [];
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    const pid = Number(entry);
    if (!pid) continue;

    const cmd = cmdLineOf(pid);
    if (!cmd) continue;

    if (cmd.includes("transcribe.py") && cmd.includes("--worker")) {
      processos.push({
        pid,
        tipo: "whisper",
        papel: "whisper-worker",
        rss_mb: rssMbOf(pid),
        cmd: cmd.slice(0, 180),
      });
      continue;
    }

    if (/(^|\/)ffmpeg(\s|$)/.test(cmd)) {
      processos.push({
        pid,
        tipo: "ffmpeg",
        papel: classificarFfmpeg(cmd),
        rss_mb: rssMbOf(pid),
        cmd: cmd.slice(0, 180),
      });
    }
  }

  return processos.sort((a, b) => a.tipo.localeCompare(b.tipo) || a.pid - b.pid);
}

function alertaDiagnostico(input: {
  whisperProcessos: number;
  whisperVivo: boolean;
  gravando: number;
  lame: number;
}): string | null {
  if (input.whisperProcessos > 1) {
    return `${input.whisperProcessos} workers Whisper neste container — deveria haver no máximo 1`;
  }
  if (input.whisperVivo && input.gravando === 0) {
    return "Whisper vivo sem rádio gravando — deveria ter encerrado sozinho";
  }
  if (input.lame >= 3) {
    return `${input.lame} ffmpeg reencodando (lame) — isso come CPU o tempo todo`;
  }
  return null;
}

export function obterDiagnosticoCpu(): DiagnosticoCpu {
  const processos = listarProcessosCpu();
  const gravacoes = getActiveRecordingDiagnostico();
  const transcricao = getTranscriptionStatus();
  const threads = Number(process.env.WHISPER_CPU_THREADS ?? 1);

  const whisperProcessos = processos.filter((item) => item.tipo === "whisper").length;
  const ffmpegCopy = processos.filter((item) => item.papel === "gravacao-copy").length;
  const ffmpegLame = processos.filter((item) => item.papel === "gravacao-lame").length;
  const ffmpegExtracao = processos.filter(
    (item) => item.papel === "extracao-wav" || item.papel === "trecho-mp3",
  ).length;
  const ffmpegOutros = processos.filter((item) => item.papel === "outro").length;
  const whisperVivo = transcricao.workerVivo || whisperProcessos > 0;

  return {
    whisper_habilitado: process.env.WHISPER_ENABLED !== "false",
    whisper_modelo: process.env.WHISPER_MODEL?.trim() || "base",
    whisper_threads: Number.isFinite(threads) && threads >= 1 ? Math.floor(threads) : 1,
    whisper_ativo: transcricao.ativo,
    whisper_ocupado: transcricao.ocupado,
    whisper_worker_vivo: whisperVivo,
    whisper_processos: whisperProcessos,
    ffmpeg_copy: ffmpegCopy || gravacoes.copy,
    ffmpeg_lame: ffmpegLame || gravacoes.lame,
    ffmpeg_extracao: ffmpegExtracao,
    ffmpeg_outros: ffmpegOutros,
    radios_marcadas: gravacoes.marcadas,
    radios_gravando: gravacoes.gravando,
    alerta: alertaDiagnostico({
      whisperProcessos,
      whisperVivo,
      gravando: gravacoes.gravando,
      lame: ffmpegLame || gravacoes.lame,
    }),
    processos,
    gravacoes: gravacoes.itens,
  };
}
