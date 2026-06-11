import type { YoutubeTranscriptSegment } from "@/lib/youtube-transcript-fetch";
import { duracaoTranscriptSegundos } from "@/lib/youtube-transcript-utils";

const USER_AGENT =
  "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

const CLIENTS = [
  { clientName: "ANDROID", clientVersion: "20.10.38" },
  { clientName: "WEB", clientVersion: "2.20240101.00.00" },
  { clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER", clientVersion: "2.0" },
] as const;

interface CaptionTrack {
  baseUrl?: string;
  languageCode?: string;
  kind?: string;
}

export class YoutubeAguardandoEstreiaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YoutubeAguardandoEstreiaError";
  }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\n/g, " ")
    .trim();
}

function normalizeCaptionUrl(baseUrl: string, fmt?: string): string {
  const url = new URL(baseUrl);
  url.searchParams.delete("limit");
  if (fmt) {
    url.searchParams.set("fmt", fmt);
  } else {
    url.searchParams.delete("fmt");
  }
  return url.toString();
}

function parseTimedTextXml(xml: string): YoutubeTranscriptSegment[] {
  const segments: YoutubeTranscriptSegment[] = [];

  for (const match of xml.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
    const attrs = match[1];
    const start = Number(attrs.match(/start="([^"]+)"/)?.[1] ?? 0);
    const duration = Number(attrs.match(/dur="([^"]+)"/)?.[1] ?? 0);
    const texto = decodeHtmlEntities(match[2].replace(/<[^>]+>/g, ""));

    if (!texto) continue;

    segments.push({
      inicioSegundos: start,
      fimSegundos: start + (duration > 0 ? duration : 2),
      texto,
    });
  }

  return segments;
}

function parseJson3Transcript(raw: string): YoutubeTranscriptSegment[] {
  const payload = JSON.parse(raw) as {
    events?: {
      tStartMs?: number;
      dDurationMs?: number;
      segs?: { utf8?: string }[];
    }[];
  };

  const events = payload.events ?? [];
  const segments: YoutubeTranscriptSegment[] = [];

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const texto = (event.segs ?? [])
      .map((seg) => seg.utf8 ?? "")
      .join("")
      .trim();

    if (!texto || texto === "\n") continue;

    const inicioSegundos = (event.tStartMs ?? 0) / 1000;
    let durationMs = event.dDurationMs ?? 0;

    if (durationMs <= 0) {
      const proximo = events.slice(index + 1).find((item) => (item.tStartMs ?? 0) > (event.tStartMs ?? 0));
      durationMs = proximo
        ? Math.max(500, (proximo.tStartMs ?? 0) - (event.tStartMs ?? 0))
        : 2000;
    }

    segments.push({
      inicioSegundos,
      fimSegundos: inicioSegundos + durationMs / 1000,
      texto: decodeHtmlEntities(texto),
    });
  }

  return segments;
}

function ordenarTracks(tracks: CaptionTrack[]): CaptionTrack[] {
  const score = (track: CaptionTrack): number => {
    const code = (track.languageCode ?? "").toLowerCase();
    if (code === "pt" || code === "pt-br") return 0;
    if (code.startsWith("pt")) return 1;
    if (code === "en" || code === "en-us") return 2;
    if (track.kind === "asr") return 3;
    return 4;
  };

  return [...tracks].sort((a, b) => score(a) - score(b));
}

async function fetchCaptionSegmentsFromTrack(
  track: CaptionTrack,
): Promise<YoutubeTranscriptSegment[]> {
  if (!track.baseUrl) return [];

  const headers = {
    "User-Agent": USER_AGENT,
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
  };

  const candidatos: YoutubeTranscriptSegment[] = [];

  const xmlUrl = normalizeCaptionUrl(track.baseUrl);
  const xmlResponse = await fetch(xmlUrl, { headers });
  if (xmlResponse.ok) {
    const xmlSegments = parseTimedTextXml(await xmlResponse.text());
    if (xmlSegments.length > 0) candidatos.push(...xmlSegments);
  }

  const jsonUrl = normalizeCaptionUrl(track.baseUrl, "json3");
  const jsonResponse = await fetch(jsonUrl, { headers });
  if (jsonResponse.ok) {
    const raw = await jsonResponse.text();
    if (raw.trim().startsWith("{")) {
      const jsonSegments = parseJson3Transcript(raw);
      if (jsonSegments.length > 0) {
        if (duracaoTranscriptSegundos(jsonSegments) > duracaoTranscriptSegundos(candidatos)) {
          return jsonSegments;
        }
      }
    }
  }

  return candidatos;
}

async function fetchBestSegmentsFromTracks(
  tracks: CaptionTrack[],
): Promise<YoutubeTranscriptSegment[]> {
  let melhor: YoutubeTranscriptSegment[] = [];

  for (const track of ordenarTracks(tracks)) {
    try {
      const segmentos = await fetchCaptionSegmentsFromTrack(track);
      if (duracaoTranscriptSegundos(segmentos) > duracaoTranscriptSegundos(melhor)) {
        melhor = segmentos;
      }
    } catch {
      // tenta próxima faixa
    }
  }

  return melhor;
}

export async function fetchYoutubeVideoDuration(videoId: string): Promise<number | null> {
  const watchHtml = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    },
  }).then((response) => response.text());

  const apiKey = watchHtml.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1];
  if (!apiKey) return null;

  const player = (await fetch(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({
      context: {
        client: { clientName: "ANDROID", clientVersion: "20.10.38", hl: "pt", gl: "BR" },
      },
      videoId,
    }),
  }).then((response) => response.json())) as {
    videoDetails?: { lengthSeconds?: string };
  };

  const seconds = Number(player.videoDetails?.lengthSeconds ?? 0);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

export async function fetchYoutubeTranscriptViaInnertube(
  videoId: string,
): Promise<YoutubeTranscriptSegment[]> {
  const watchHtml = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    },
  }).then((response) => response.text());

  const apiKey = watchHtml.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1];
  if (!apiKey) {
    throw new Error("INNERTUBE_API_KEY não encontrada");
  }

  let lastError: Error | null = null;
  let melhorGlobal: YoutubeTranscriptSegment[] = [];

  for (const client of CLIENTS) {
    try {
      const player = (await fetch(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": USER_AGENT,
        },
        body: JSON.stringify({
          context: {
            client: {
              ...client,
              hl: "pt",
              gl: "BR",
            },
          },
          videoId,
        }),
      }).then((response) => response.json())) as {
        playabilityStatus?: { status?: string; reason?: string };
        captions?: {
          playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] };
        };
        playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] };
      };

      const playability = player.playabilityStatus?.status;
      if (playability === "LIVE_STREAM_OFFLINE" || playability === "UNPLAYABLE") {
        const reason = player.playabilityStatus?.reason ?? "Vídeo ainda não disponível";
        throw new YoutubeAguardandoEstreiaError(reason);
      }

      const tracks =
        player.captions?.playerCaptionsTracklistRenderer?.captionTracks ??
        player.playerCaptionsTracklistRenderer?.captionTracks ??
        [];

      if (tracks.length === 0) {
        throw new Error("Nenhuma faixa de legenda no Innertube");
      }

      const segmentos = await fetchBestSegmentsFromTracks(tracks);
      if (duracaoTranscriptSegundos(segmentos) > duracaoTranscriptSegundos(melhorGlobal)) {
        melhorGlobal = segmentos;
      }

      if (melhorGlobal.length > 0) {
        return melhorGlobal;
      }
    } catch (error) {
      if (error instanceof YoutubeAguardandoEstreiaError) throw error;
      lastError = error instanceof Error ? error : new Error("Falha no Innertube");
    }
  }

  if (melhorGlobal.length > 0) return melhorGlobal;

  throw lastError ?? new Error("Falha no Innertube");
}
