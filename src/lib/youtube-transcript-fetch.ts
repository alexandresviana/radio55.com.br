import {
  fetchTranscript,
  listLanguages,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptNotAvailableLanguageError,
} from "youtube-transcript-plus";
import {
  fetchYoutubeTranscriptViaInnertube,
  YoutubeAguardandoEstreiaError,
} from "@/lib/youtube-transcript-innertube";
import { fetchYoutubeTranscriptViaPlayzone } from "@/lib/youtube-transcript-playzone";

export interface YoutubeTranscriptSegment {
  inicioSegundos: number;
  fimSegundos: number;
  texto: string;
}

export { YoutubeAguardandoEstreiaError };

export class YoutubeSemTranscriptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YoutubeSemTranscriptError";
  }
}

const LANGUAGE_PRIORITY = ["pt", "pt-BR", "pt-br", "en", "en-US"];

type ProviderName = "youtube-transcript-plus" | "playzone" | "innertube";

async function fetchViaTranscriptPlus(
  videoId: string,
): Promise<YoutubeTranscriptSegment[]> {
  const languagesToTry = new Set<string>(LANGUAGE_PRIORITY);

  try {
    const available = await listLanguages(videoId);
    for (const track of available) {
      languagesToTry.add(track.languageCode);
    }
  } catch {
    // listLanguages falhou — tenta prioridade fixa
  }

  let lastError: unknown;
  for (const lang of languagesToTry) {
    try {
      const segments = await fetchTranscript(videoId, {
        lang,
        retries: 2,
        retryDelay: 1200,
      });

      const mapped = mapSegments(segments);
      if (mapped.length > 0) return mapped;
    } catch (error) {
      lastError = error;
      if (
        error instanceof YoutubeTranscriptNotAvailableLanguageError ||
        error instanceof YoutubeTranscriptNotAvailableError ||
        error instanceof YoutubeTranscriptDisabledError
      ) {
        continue;
      }
      throw error;
    }
  }

  throw lastError ?? new YoutubeSemTranscriptError("Nenhuma legenda via youtube-transcript-plus");
}

function mapSegments(
  segments: { offset: number; duration: number; text: string }[],
): YoutubeTranscriptSegment[] {
  return segments
    .map((segment) => ({
      inicioSegundos: segment.offset,
      fimSegundos: segment.offset + segment.duration,
      texto: segment.text.trim(),
    }))
    .filter((segment) => segment.texto.length > 0);
}

async function runProvider(
  provider: ProviderName,
  videoId: string,
): Promise<YoutubeTranscriptSegment[]> {
  switch (provider) {
    case "youtube-transcript-plus":
      return fetchViaTranscriptPlus(videoId);
    case "playzone":
      return fetchYoutubeTranscriptViaPlayzone(videoId);
    case "innertube":
      return fetchYoutubeTranscriptViaInnertube(videoId);
    default:
      return [];
  }
}

function isUnavailableError(error: unknown): boolean {
  if (error instanceof YoutubeSemTranscriptError) return true;
  if (error instanceof YoutubeTranscriptNotAvailableError) return true;
  if (error instanceof YoutubeTranscriptDisabledError) return true;
  if (error instanceof YoutubeTranscriptNotAvailableLanguageError) return true;

  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("no transcript") ||
    message.includes("not available") ||
    message.includes("disabled") ||
    message.includes("no transcript found") ||
    message.includes("could not retrieve")
  );
}

export async function fetchYoutubeTranscript(
  videoId: string,
): Promise<{ segmentos: YoutubeTranscriptSegment[]; fonte: ProviderName }> {
  const providers: ProviderName[] = ["youtube-transcript-plus", "playzone", "innertube"];
  const errors: string[] = [];

  for (const provider of providers) {
    try {
      const segmentos = await runProvider(provider, videoId);
      if (segmentos.length > 0) {
        return { segmentos, fonte: provider };
      }
      errors.push(`${provider}: legenda vazia`);
    } catch (error) {
      if (error instanceof YoutubeAguardandoEstreiaError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${provider}: ${message}`);

      if (!isUnavailableError(error)) {
        console.warn(`[youtube-transcript] ${provider} falhou para ${videoId}: ${message}`);
      }
    }
  }

  throw new YoutubeSemTranscriptError(
    errors.join(" | ") || "Nenhuma legenda encontrada para este vídeo",
  );
}
