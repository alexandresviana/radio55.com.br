import type { Radio } from "@/types";

const TZ = "America/Sao_Paulo";
const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Valida horário no formato HH:MM (24h). */
export function isHorarioGravacaoValido(valor: unknown): valor is string {
  return typeof valor === "string" && HHMM_RE.test(valor.trim());
}

function parseMinutos(hhmm: string): number {
  const [h, m] = hhmm.trim().split(":").map(Number);
  return h * 60 + m;
}

/** Minutos desde 00:00 no fuso America/Sao_Paulo. */
export function minutosAgoraSaoPaulo(agora: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(agora);

  const hora = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minuto = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hora * 60 + minuto;
}

/**
 * true se a rádio deve estar gravando agora.
 * Sem início/fim (ou iguais) = 24h. Faixa pode atravessar meia-noite (ex.: 22:00–06:00).
 */
export function radioDeveGravarAgora(
  radio: Pick<Radio, "gravar" | "gravarInicio" | "gravarFim">,
  agora: Date = new Date(),
): boolean {
  if (!radio.gravar) return false;

  const inicio = radio.gravarInicio?.trim() ?? "";
  const fim = radio.gravarFim?.trim() ?? "";

  if (!inicio || !fim) return true;
  if (!isHorarioGravacaoValido(inicio) || !isHorarioGravacaoValido(fim)) return true;
  if (inicio === fim) return true;

  const agoraMin = minutosAgoraSaoPaulo(agora);
  const inicioMin = parseMinutos(inicio);
  const fimMin = parseMinutos(fim);

  if (inicioMin < fimMin) {
    return agoraMin >= inicioMin && agoraMin < fimMin;
  }

  // Atravessa meia-noite: ex. 22:00 → 06:00
  return agoraMin >= inicioMin || agoraMin < fimMin;
}

export function rotuloFaixaGravacao(
  radio: Pick<Radio, "gravar" | "gravarInicio" | "gravarFim">,
): string | null {
  if (!radio.gravar) return null;

  const inicio = radio.gravarInicio?.trim() ?? "";
  const fim = radio.gravarFim?.trim() ?? "";

  if (!inicio || !fim || inicio === fim) return "24h";
  if (!isHorarioGravacaoValido(inicio) || !isHorarioGravacaoValido(fim)) return "24h";
  return `${inicio}–${fim}`;
}
