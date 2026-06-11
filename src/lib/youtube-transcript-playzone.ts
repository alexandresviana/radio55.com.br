import { YouTubeTranscriptApi } from "@playzone/youtube-transcript/dist/api";
import type { YoutubeTranscriptSegment } from "@/lib/youtube-transcript-fetch";

const LANGUAGE_PRIORITY = ["pt", "pt-BR", "pt-br", "en", "en-US"];

let apiInstance: YouTubeTranscriptApi | null = null;

function getApi(): YouTubeTranscriptApi {
  if (!apiInstance) {
    apiInstance = new YouTubeTranscriptApi();
  }
  return apiInstance;
}

export async function fetchYoutubeTranscriptViaPlayzone(
  videoId: string,
): Promise<YoutubeTranscriptSegment[]> {
  const api = getApi();
  const transcriptList = await api.list(videoId);
  const available = transcriptList.getAllTranscripts().map((item) => item.languageCode);

  const languages = [
    ...LANGUAGE_PRIORITY.filter((code) =>
      available.some((item) => item.toLowerCase() === code.toLowerCase()),
    ),
    ...available.filter(
      (code) => !LANGUAGE_PRIORITY.some((item) => item.toLowerCase() === code.toLowerCase()),
    ),
  ];

  const fetched = await api.fetch(videoId, languages.length > 0 ? languages : LANGUAGE_PRIORITY);
  const snippets = [...fetched.snippets];

  return snippets
    .map((snippet) => ({
      inicioSegundos: snippet.start,
      fimSegundos: snippet.start + snippet.duration,
      texto: snippet.text.trim(),
    }))
    .filter((segment) => segment.texto.length > 0);
}
