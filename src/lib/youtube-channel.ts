const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const CHANNEL_ID_RE = /UC[\w-]{22}/;

export interface YoutubeRssVideo {
  videoId: string;
  titulo: string;
  publicadoEm: Date;
}

export function normalizeYoutubeChannelInput(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  if (trimmed.startsWith("@")) {
    return `https://www.youtube.com/${trimmed}`;
  }

  if (CHANNEL_ID_RE.test(trimmed)) {
    return `https://www.youtube.com/channel/${trimmed}`;
  }

  return `https://www.youtube.com/${trimmed}`;
}

export async function resolveYoutubeChannel(
  input: string,
): Promise<{ channelId: string; titulo: string }> {
  const normalized = normalizeYoutubeChannelInput(input);
  if (!normalized) {
    throw new Error("Informe a URL ou o identificador do canal");
  }

  const directMatch = normalized.match(/youtube\.com\/channel\/(UC[\w-]{22})/i);
  if (directMatch) {
    const channelId = directMatch[1];
    const titulo = await fetchChannelTitleFromRss(channelId);
    return { channelId, titulo };
  }

  const response = await fetch(normalized, {
    headers: { "User-Agent": USER_AGENT },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Não foi possível acessar o canal (${response.status})`);
  }

  const finalUrl = response.url;
  const redirectedMatch = finalUrl.match(/youtube\.com\/channel\/(UC[\w-]{22})/i);
  if (redirectedMatch) {
    const channelId = redirectedMatch[1];
    const titulo = await fetchChannelTitleFromRss(channelId);
    return { channelId, titulo };
  }

  const html = await response.text();
  const channelId =
    html.match(/"channelId":"(UC[\w-]{22})"/)?.[1] ??
    html.match(/"externalId":"(UC[\w-]{22})"/)?.[1] ??
    html.match(/itemprop="channelId" content="(UC[\w-]{22})"/)?.[1];

  if (!channelId) {
    throw new Error("Não foi possível identificar o ID do canal do YouTube");
  }

  const titulo =
    html.match(/"author":"([^"]+)"/)?.[1] ??
    html.match(/<meta name="title" content="([^"]+)"/)?.[1] ??
    html.match(/<title>([^<]+)<\/title>/)?.[1]?.replace(/ - YouTube$/, "").trim() ??
    channelId;

  return { channelId, titulo };
}

export async function fetchChannelVideosFromRss(
  channelId: string,
): Promise<YoutubeRssVideo[]> {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(`Feed RSS do canal indisponível (${response.status})`);
  }

  const xml = await response.text();
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)];

  return entries
    .map((match) => {
      const entry = match[1];
      const videoId = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1]?.trim();
      const titulo = entry.match(/<title>([^<]+)<\/title>/)?.[1]?.trim();
      const published = entry.match(/<published>([^<]+)<\/published>/)?.[1]?.trim();

      if (!videoId || !titulo) return null;

      return {
        videoId,
        titulo,
        publicadoEm: published ? new Date(published) : new Date(),
      };
    })
    .filter((item): item is YoutubeRssVideo => item !== null);
}

async function fetchChannelTitleFromRss(channelId: string): Promise<string> {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) return channelId;

  const xml = await response.text();
  return (
    xml.match(/<author>\s*<name>([^<]+)<\/name>/)?.[1]?.trim() ??
    xml.match(/<title>([^<]+)<\/title>/)?.[1]?.trim() ??
    channelId
  );
}

export function youtubeWatchUrl(videoId: string, segundos?: number): string {
  const base = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  if (segundos === undefined || segundos < 1) return base;
  return `${base}&t=${Math.floor(segundos)}s`;
}
