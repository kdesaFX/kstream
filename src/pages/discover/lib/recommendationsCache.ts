import type { DiscoverMedia } from "@/pages/discover/types/discover";

// Below this age, serve the cache and skip the network call entirely.
const FRESH_MS = 15 * 60 * 1000;
// Below this age (but past fresh), serve the cache immediately and
// refresh it silently in the background.
const STALE_MS = 2 * 60 * 60 * 1000;

const STORAGE_KEY = "__MW::personalRecsCache";

type CacheKey = "movie" | "show";

interface CacheEntry {
  signature: string;
  builtAt: number;
  media: DiscoverMedia[];
}

type CacheShape = Partial<Record<CacheKey, CacheEntry>>;

export type CacheFreshness = "fresh" | "stale" | "miss";

function readAll(): CacheShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeAll(cache: CacheShape) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // storage unavailable/full - caching is a pure optimization, ignore
  }
}

export function readRecommendationsCache(
  key: CacheKey,
  signature: string,
): { media: DiscoverMedia[]; freshness: CacheFreshness } {
  const entry = readAll()[key];
  if (!entry || entry.signature !== signature)
    return { media: [], freshness: "miss" };

  const age = Date.now() - entry.builtAt;
  if (age < FRESH_MS) return { media: entry.media, freshness: "fresh" };
  if (age < STALE_MS) return { media: entry.media, freshness: "stale" };
  return { media: [], freshness: "miss" };
}

export function writeRecommendationsCache(
  key: CacheKey,
  signature: string,
  media: DiscoverMedia[],
) {
  const all = readAll();
  all[key] = { signature, builtAt: Date.now(), media };
  writeAll(all);
}
