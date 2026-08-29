import {
  anilistHitToListItem,
  listAniListManga,
  type AniListDiscoverKind,
  type AniListMangaHit,
} from "@/backend/manga/anilistDiscover";
import {
  listManga,
  mangaToMediaItem,
  type MangaOrder,
} from "@/backend/manga/mangadex";
import { MANGA_GENRE_TAGS, type MangaGenreTagKey } from "@/backend/manga/mangaTags";
import { resolveDiscoverMangaIds } from "@/backend/manga/resolveDiscoverMangaId";
import type { MangaListItem } from "@/backend/manga/types";
import { normalizeMangaTitle } from "@/backend/manga/weebcentral";
import type { MediaItem } from "@/utils/media/mediaTypes";

const LIST_TTL_MS = 15 * 60 * 1000;
const listCache = new Map<string, { at: number; items: MangaListItem[] }>();
const listInFlight = new Map<string, Promise<MangaListItem[]>>();

const KIND_MD_ORDER: Record<
  "popular" | "topRated" | "latest" | "recentlyAdded",
  MangaOrder
> = {
  popular: "followedCount",
  topRated: "rating",
  latest: "latestUploadedChapter",
  recentlyAdded: "createdAt",
};

function isCoreKind(
  kind: AniListDiscoverKind,
): kind is "popular" | "topRated" | "latest" | "recentlyAdded" {
  return kind in KIND_MD_ORDER;
}

function isGenreKind(kind: AniListDiscoverKind): kind is MangaGenreTagKey {
  return kind in MANGA_GENRE_TAGS;
}

function indexMangaPool(pool: MangaListItem[]): Map<string, MangaListItem> {
  const byTitle = new Map<string, MangaListItem>();
  for (const item of pool) {
    const primary = normalizeMangaTitle(item.title);
    if (primary && !byTitle.has(primary)) byTitle.set(primary, item);
    for (const alt of item.alternateTitles ?? []) {
      const key = normalizeMangaTitle(alt);
      if (key && !byTitle.has(key)) byTitle.set(key, item);
    }
  }
  return byTitle;
}

function matchPool(
  hit: AniListMangaHit,
  byTitle: Map<string, MangaListItem>,
): MangaListItem | undefined {
  const keys = [hit.title, ...hit.alternateTitles].map(normalizeMangaTitle);
  for (const key of keys) {
    const found = byTitle.get(key);
    if (found) return found;
  }
  return undefined;
}

function withAniListArt(
  base: MangaListItem,
  hit: AniListMangaHit,
): MangaListItem {
  return {
    ...base,
    // Prefer AniList extraLarge over MangaDex thumbs.
    poster: hit.cover || base.poster,
    description: hit.description || base.description,
    rating: hit.rating ?? base.rating,
    year: hit.year ?? base.year,
    status: hit.status !== "unknown" ? hit.status : base.status,
  };
}

/**
 * Discover catalog: AniList for speed + HD covers, MangaDex/WeebCentral ids so
 * the reader still opens. Matches against a parallel MD list when possible so
 * we only title-search the leftovers.
 */
export async function listDiscoverManga(ops: {
  kind: AniListDiscoverKind;
  limit?: number;
  page?: number;
}): Promise<MangaListItem[]> {
  const limit = ops.limit ?? 24;
  const page = ops.page ?? 1;
  const cacheKey = `${ops.kind}:${limit}:${page}`;

  const cached = listCache.get(cacheKey);
  if (cached && Date.now() - cached.at < LIST_TTL_MS) return cached.items;

  const pending = listInFlight.get(cacheKey);
  if (pending) return pending;

  const run = (async () => {
    const alPromise = listAniListManga({
      kind: ops.kind,
      limit,
      page,
    });

    const mdPromise =
      page === 1
        ? listManga({
            order: isCoreKind(ops.kind)
              ? KIND_MD_ORDER[ops.kind]
              : "followedCount",
            limit: Math.max(limit * 2, 48),
            includeStats: false,
            includedTags: isGenreKind(ops.kind)
              ? [MANGA_GENRE_TAGS[ops.kind]]
              : undefined,
          }).catch(() => [] as MangaListItem[])
        : Promise.resolve([] as MangaListItem[]);

    const [anilist, mdPool] = await Promise.all([alPromise, mdPromise]);
    const byTitle = indexMangaPool(mdPool);

    const byAniTitle = new Map<string, MangaListItem>();
    const needResolve: AniListMangaHit[] = [];

    for (const hit of anilist) {
      const md = matchPool(hit, byTitle);
      if (md) {
        byAniTitle.set(hit.title, withAniListArt(md, hit));
      } else {
        needResolve.push(hit);
      }
    }

    if (needResolve.length > 0) {
      // Hard budget — never leave carousels/hero waiting on title search storms.
      const ids = await resolveDiscoverMangaIds(needResolve, 6, 4000);
      for (const hit of needResolve) {
        const id = ids.get(hit.title);
        if (!id) continue;
        byAniTitle.set(hit.title, anilistHitToListItem(hit, id));
      }
    }

    const items: MangaListItem[] = [];
    const seen = new Set<string>();
    for (const hit of anilist) {
      const item = byAniTitle.get(hit.title);
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
      if (items.length >= limit) break;
    }

    listCache.set(cacheKey, { at: Date.now(), items });
    return items;
  })();

  listInFlight.set(cacheKey, run);
  try {
    return await run;
  } finally {
    listInFlight.delete(cacheKey);
  }
}

export function discoverMangaToMediaItem(item: MangaListItem): MediaItem {
  return mangaToMediaItem(item);
}

/** Warm AniList pages only — full id-resolve belongs on first carousel paint. */
export function prefetchDiscoverManga(): void {
  const kinds: AniListDiscoverKind[] = ["popular", "latest", "topRated"];
  for (const kind of kinds) {
    void listAniListManga({ kind, limit: 24 }).catch(() => undefined);
  }
  void listManga({
    order: "followedCount",
    limit: 48,
    includeStats: false,
  }).catch(() => undefined);
}
