export function youtubeThumbnailUrl(videoId: string, size: "default" | "mq" | "hq" = "mq"): string {
  const suffix =
    size === "hq" ? "hqdefault.jpg" : size === "default" ? "default.jpg" : "mqdefault.jpg";
  return `https://i.ytimg.com/vi/${videoId}/${suffix}`;
}
