/* eslint-disable no-console */
import { CaptionListItem } from "@/stores/player/slices/source";

const NATSUKI_BASE = "https://natsuki.fontaine.lol/search";

interface NatsukiSubtitleEntry {
  id?: string;
  url?: string;
  format?: string;
  encoding?: string;
  display?: string;
  language?: string;
  media?: string;
  isHearingImpaired?: boolean;
  source?: string;
  release?: string;
  releases?: string[];
  flagUrl?: string;
  origin?: string;
}

function mapEntries(data: unknown): CaptionListItem[] {
  if (!Array.isArray(data)) return [];
  return (data as NatsukiSubtitleEntry[])
    .filter((sub) => typeof sub.url === "string" && sub.url)
    .map((sub) => {
      const fmt =
        sub.format === "srt" || sub.format === "vtt" ? sub.format : "srt";
      const upstream = sub.source ?? "";
      return {
        id: sub.id ?? sub.url!,
        language: sub.language || "unknown",
        url: sub.url!,
        type: fmt,
        needsProxy: false,
        opensubtitles: true,
        display: sub.display,
        media: sub.media,
        isHearingImpaired: sub.isHearingImpaired,
        source: `natsuki ${upstream}`.trim(),
        encoding: sub.encoding,
        flagUrl: sub.flagUrl,
        release: sub.release,
        releases: sub.releases,
        origin: sub.origin,
      } as CaptionListItem;
    });
}

export async function scrapeNatsukiCaptions(
  tmdbId: string | number,
  imdbId: string,
  season?: number,
  episode?: number,
): Promise<CaptionListItem[]> {
  const id = imdbId || (tmdbId ? String(tmdbId) : "");
  if (!id) return [];

  const params = new URLSearchParams();
  params.set("id", id);
  params.set("source", "all");
  if (season && episode) {
    params.set("season", String(season));
    params.set("episode", String(episode));
  }

  try {
    const res = await fetch(`${NATSUKI_BASE}?${params.toString()}`, {
      method: "GET",
    });
    if (!res.ok) {
      console.warn(`Natsuki HTTP ${res.status}`);
      return [];
    }
    const data = await res.json();
    return mapEntries(data);
  } catch (err) {
    console.error("Natsuki fetch failed:", err);
    return [];
  }
}
