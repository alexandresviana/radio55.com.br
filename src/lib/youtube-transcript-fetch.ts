import {
  fetchTranscript,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptNotAvailableLanguageError,
} from "youtube-transcript-plus";

export interface YoutubeTranscriptSegment {
  inicioSegundos: number;
  fimSegundos: number;
  texto: string;
}

export class YoutubeSemTranscriptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YoutubeSemTranscriptError";
  }
}

export async function fetchYoutubeTranscript(
  videoId: string,
): Promise<YoutubeTranscriptSegment[]> {
  const languages = ["pt", "pt-BR", "en"];

  let lastError: unknown;
  for (const lang of languages) {
    try {
      const segments = await fetchTranscript(videoId, {
        lang,
        retries: 3,
        retryDelay: 1500,
      });

      return segments
        .map((segment) => ({
          inicioSegundos: segment.offset,
          fimSegundos: segment.offset + segment.duration,
          texto: segment.text.trim(),
        }))
        .filter((segment) => segment.texto.length > 0);
    } catch (error) {
      lastError = error;
      if (
        error instanceof YoutubeTranscriptNotAvailableLanguageError ||
        error instanceof YoutubeTranscriptNotAvailableError
      ) {
        continue;
      }
      if (
        error instanceof YoutubeTranscriptDisabledError ||
        error instanceof YoutubeTranscriptNotAvailableError
      ) {
        throw new YoutubeSemTranscriptError(
          error instanceof Error ? error.message : "Transcrição indisponível",
        );
      }
      throw error;
    }
  }

  if (lastError instanceof YoutubeTranscriptDisabledError) {
    throw new YoutubeSemTranscriptError(lastError.message);
  }

  throw new YoutubeSemTranscriptError(
    lastError instanceof Error
      ? lastError.message
      : "Nenhuma legenda encontrada para este vídeo",
  );
}
