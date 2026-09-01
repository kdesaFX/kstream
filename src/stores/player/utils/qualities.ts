import { Qualities, Stream } from "@p-stream/providers";

import { QualityStore } from "@/stores/quality";

export type SourceQuality = Qualities;

export type StreamType = "hls" | "mp4";

export type SourceFileStream = {
  type: "mp4";
  url: string;
};

export type LoadableSource = {
  type: StreamType;
  url: string;
  headers?: Stream["headers"];
  preferredHeaders?: Stream["preferredHeaders"];
};

export type SourceSliceSource =
  | {
      type: "file";
      qualities: Partial<Record<SourceQuality, SourceFileStream>>;
      headers?: Stream["headers"];
      preferredHeaders?: Stream["preferredHeaders"];
      audioLanguage?: string;
      audioLabel?: string;
    }
  | {
      type: "hls";
      url: string;
      headers?: Stream["headers"];
      preferredHeaders?: Stream["preferredHeaders"];
      audioLanguage?: string;
      audioLabel?: string;
    };

const qualitySorting: Record<SourceQuality, number> = {
  unknown: 0,
  "360": 10,
  "480": 20,
  "720": 30,
  "1080": 40,
  "4k": 35, // 4k has lower priority, you need faster internet for it
};
const sortedQualities: SourceQuality[] = Object.entries(qualitySorting)
  .sort((a, b) => b[1] - a[1])
  .map<SourceQuality>((v) => v[0] as SourceQuality);

export function getPreferredQuality(
  availableQualites: SourceQuality[],
  qualityPreferences: QualityStore["quality"],
) {
  if (
    qualityPreferences.automaticQuality ||
    qualityPreferences.lastChosenQuality === null ||
    qualityPreferences.lastChosenQuality === "unknown"
  ) {
    // For automatic quality, select the best available quality
    // Sort by our quality preference order and pick the first (best) available
    return sortedQualities.find((v) => availableQualites.includes(v));
  }

  // get preferred quality - not automatic or unknown
  const chosenQualityIndex = sortedQualities.indexOf(
    qualityPreferences.lastChosenQuality,
  );
  let nearestChoseQuality: undefined | SourceQuality;

  // check chosen quality or lower
  for (let i = chosenQualityIndex; i < sortedQualities.length; i += 1) {
    if (availableQualites.includes(sortedQualities[i])) {
      nearestChoseQuality = sortedQualities[i];
      break;
    }
  }
  if (nearestChoseQuality) return nearestChoseQuality;

  // chosen quality or lower doesn't exist, try higher
  for (let i = chosenQualityIndex; i >= 0; i -= 1) {
    if (availableQualites.includes(sortedQualities[i])) {
      nearestChoseQuality = sortedQualities[i];
      break;
    }
  }
  return nearestChoseQuality;
}

export function selectQuality(
  source: SourceSliceSource,
  qualityPreferences: QualityStore["quality"],
): {
  stream: LoadableSource;
  quality: null | SourceQuality;
} {
  if (source.type === "hls")
    return {
      stream: source,
      quality: null,
    };
  if (source.type === "file") {
    const availableQualities = Object.entries(source.qualities)
      .filter((entry) => (entry[1].url.length ?? 0) > 0)
      .map((entry) => entry[0]) as SourceQuality[];
    // For file sources (MP4), always use manual quality selection since they don't support switching
    const manualQualityPreferences = {
      ...qualityPreferences,
      automaticQuality: false,
    };
    const quality = getPreferredQuality(
      availableQualities,
      manualQualityPreferences,
    );
    if (quality) {
      const stream = source.qualities[quality];
      if (stream) {
        return { stream, quality };
      }
    }
  }
  throw new Error("couldn't select quality");
}

const qualityNameMap: Record<SourceQuality, string> = {
  "4k": "4K",
  "1080": "1080p",
  "360": "360p",
  "480": "480p",
  "720": "720p",
  unknown: "unknown",
};

export const allQualities = Object.keys(qualityNameMap) as SourceQuality[];

export function qualityToString(quality: SourceQuality): string {
  return qualityNameMap[quality];
}

/** Union quality tiers without duplicates, best-first. */
export function mergeQualityTiers(
  ...lists: Array<SourceQuality[] | readonly SourceQuality[]>
): SourceQuality[] {
  const seen = new Set<SourceQuality>();
  const out: SourceQuality[] = [];
  for (const list of lists) {
    for (const quality of list) {
      if (quality === "unknown" || seen.has(quality)) continue;
      seen.add(quality);
      out.push(quality);
    }
  }
  return out.sort((a, b) => qualitySorting[b] - qualitySorting[a]);
}

/** Highest tier present in a list (e.g. HLS ladder or quality menu rows). */
export function highestAvailableQuality(
  qualities: SourceQuality[],
): SourceQuality | null {
  let best: SourceQuality | null = null;
  let bestScore = -1;
  for (const quality of qualities) {
    if (quality === "unknown") continue;
    const score = qualitySorting[quality];
    if (score > bestScore) {
      bestScore = score;
      best = quality;
    }
  }
  return best;
}

const exactHeightMap: Record<number, SourceQuality> = {
  360: "360",
  480: "480",
  720: "720",
  1080: "1080",
  1440: "1080",
  2160: "4k",
};

/** Map decoded / HLS pixel height to a standard quality bucket. */
export function resolutionHeightToQuality(
  height: number,
): SourceQuality | null {
  if (!height || height <= 0) return null;

  const exact = exactHeightMap[height];
  if (exact) return exact;

  if (height >= 1800) return "4k";
  if (height >= 800) return "1080";
  if (height >= 600) return "720";
  if (height >= 420) return "480";
  return "360";
}
