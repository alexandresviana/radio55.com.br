import type { YoutubeTranscriptSegment } from "@/lib/youtube-transcript-fetch";

export function duracaoTranscriptSegundos(
  segmentos: YoutubeTranscriptSegment[],
): number {
  if (segmentos.length === 0) return 0;
  return Math.max(...segmentos.map((segmento) => segmento.fimSegundos));
}

export function escolherTranscriptMaisLongo(
  candidatos: { segmentos: YoutubeTranscriptSegment[]; fonte: string }[],
): { segmentos: YoutubeTranscriptSegment[]; fonte: string } | null {
  if (candidatos.length === 0) return null;

  return candidatos.reduce((melhor, atual) =>
    duracaoTranscriptSegundos(atual.segmentos) > duracaoTranscriptSegundos(melhor.segmentos)
      ? atual
      : melhor,
  );
}
