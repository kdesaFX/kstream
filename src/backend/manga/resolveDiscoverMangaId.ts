import { searchManga as searchMangaDex } from "@/backend/manga/mangadex";
import {
  normalizeMangaTitle,
  searchWeebCentral,
} from "@/backend/manga/weebcentral";

const TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { at: number; id: string | null }>();
const inFlight = new Map<string, Promise<string | null>>();

function cacheKey(title: string): string {
  return normalizeMangaTitle(title);
}

function scoreTitleMatch(
  needle: string,
  candidate: string,
  alts: string[] = [],
): number {
  const n = normalizeMangaTitle(needle);
  const c = normalizeMangaTitle(candidate);
  if (!n || !c) return 0;
  if (n === c) return 100;
  if (alts.some((a) => normalizeMangaTitle(a) === n)) return 95;
  if (c.startsWith(n) || n.startsWith(c)) return 80;
  if (c.includes(n) || n.includes(c)) return 60;
  return 0;
}

/**
 * Map an AniList catalog title to a readable MangaDex (or WeebCentral) id.
 * Session-cached so carousel rows and featured don't re-search the same title.
 */
export async function resolveDiscoverMangaId(
  title: string,
  alternateTitles: string[] = [],
): Promise<string | null> {
  const key = cacheKey(title);
  if (!key) return null;

  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.id;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const run = (async () => {
    const queries = [title, ...alternateTitles].filter(Boolean);
    let bestId: string | null = null;
    let bestScore = 0;

    for (const query of queries) {
      try {
        const hits = await searchMangaDex(query, 8, { includeStats: false });
        for (const hit of hits) {
          const score = Math.max(
            scoreTitleMatch(title, hit.title, hit.alternateTitles),
            scoreTitleMatch(query, hit.title, hit.alternateTitles),
          );
          if (score > bestScore) {
            bestScore = score;
            bestId = hit.id;
          }
        }
        if (bestScore >= 95) break;
      } catch {
        // Try next query / WeebCentral
      }
    }

    if (bestId && bestScore >= 60) {
      cache.set(key, { at: Date.now(), id: bestId });
      return bestId;
    }

    try {
      const wc = await searchWeebCentral(title, 6);
      for (const hit of wc) {
        const score = scoreTitleMatch(title, hit.title);
        if (score > bestScore) {
          bestScore = score;
          bestId = hit.id;
        }
      }
    } catch {
      // leave bestId as-is
    }

    const id = bestId && bestScore >= 60 ? bestId : null;
    cache.set(key, { at: Date.now(), id });
    return id;
  })();

  inFlight.set(key, run);
  try {
    return await run;
  } finally {
    inFlight.delete(key);
  }
}

/** Resolve many titles with a small concurrency pool. */
export async function resolveDiscoverMangaIds(
  items: Array<{ title: string; alternateTitles?: string[] }>,
  concurrency = 8,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (items.length === 0) return out;

  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next;
      next += 1;
      const item = items[i]!;
      const id = await resolveDiscoverMangaId(
        item.title,
        item.alternateTitles ?? [],
      );
      if (id) out.set(item.title, id);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return out;
}
