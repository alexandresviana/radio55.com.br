import type { YoutubeTranscriptSegment } from "@/lib/youtube-transcript-fetch";

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
    events?: { tStartMs?: number; dDurationMs?: number; segs?: { utf8?: string }[] }[];
  };

  const segments: YoutubeTranscriptSegment[] = [];

  for (const event of payload.events ?? []) {
    const texto = (event.segs ?? [])
      .map((seg) => seg.utf8 ?? "")
      .join("")
      .trim();

    if (!texto || texto === "\n") continue;

    const inicioSegundos = (event.tStartMs ?? 0) / 1000;
    const duration = (event.dDurationMs ?? 2000) / 1000;

    segments.push({
      inicioSegundos,
      fimSegundos: inicioSegundos + duration,
      texto: decodeHtmlEntities(texto),
    });
  }

  return segments;
}

function pickCaptionTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  if (tracks.length === 0) return null;

  const preferred = ["pt", "pt-BR", "pt-br", "en", "en-US"];
  for (const code of preferred) {
    const track = tracks.find((item) => item.languageCode?.toLowerCase() === code.toLowerCase());
    if (track?.baseUrl) return track;
  }

  return tracks.find((item) => item.baseUrl) ?? null;
}

async function fetchCaptionSegments(track: CaptionTrack): Promise<YoutubeTranscriptSegment[]> {
  if (!track.baseUrl) return [];

  const jsonUrl = track.baseUrl.includes("fmt=")
    ? track.baseUrl.replace(/fmt=[^&]+/, "fmt=json3")
    : `${track.baseUrl}${track.baseUrl.includes("?") ? "&" : "?"}fmt=json3`;

  const jsonResponse = await fetch(jsonUrl, {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8" },
  });

  if (jsonResponse.ok) {
    const raw = await jsonResponse.text();
    if (raw.trim().startsWith("{")) {
      const parsed = parseJson3Transcript(raw);
      if (parsed.length > 0) return parsed;
    }
  }

  const xmlResponse = await fetch(track.baseUrl, {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8" },
  });

  if (!xmlResponse.ok) {
    throw new Error(`Legenda indisponível (${xmlResponse.status})`);
  }

  return parseTimedTextXml(await xmlResponse.text());
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

      const track = pickCaptionTrack(tracks);
      if (!track) {
        throw new Error("Nenhuma faixa de legenda no Innertube");
      }

      const segments = await fetchCaptionSegments(track);
      if (segments.length === 0) {
        throw new Error("Legenda vazia no Innertube");
      }

      return segments;
    } catch (error) {
      if (error instanceof YoutubeAguardandoEstreiaError) throw error;
      lastError = error instanceof Error ? error : new Error("Falha no Innertube");
    }
  }

  throw lastError ?? new Error("Falha no Innertube");
}
