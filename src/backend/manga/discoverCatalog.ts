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

/** Prefer a usable row over an empty AniList-matched one. */
const MIN_USABLE = 8;

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

function mdOrderFor(kind: AniListDiscoverKind): MangaOrder {
  return isCoreKind(kind) ? KIND_MD_ORDER[kind] : "followedCount";
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
    poster: hit.cover || base.poster,
    description: hit.description || base.description,
    rating: hit.rating ?? base.rating,
    year: hit.year ?? base.year,
    status: hit.status !== "unknown" ? hit.status : base.status,
  };
}

function findAniListArt(
  item: MangaListItem,
  anilist: AniListMangaHit[],
): AniListMangaHit | undefined {
  const keys = new Set(
    [item.title, ...(item.alternateTitles ?? [])].map(normalizeMangaTitle),
  );
  return anilist.find((hit) =>
    [hit.title, ...hit.alternateTitles].some((t) =>
      keys.has(normalizeMangaTitle(t)),
    ),
  );
}

function fillFromMdPool(
  items: MangaListItem[],
  mdPool: MangaListItem[],
  anilist: AniListMangaHit[],
  limit: number,
): MangaListItem[] {
  if (items.length >= Math.min(MIN_USABLE, limit)) return items;
  const seen = new Set(items.map((item) => item.id));
  const out = [...items];
  for (const md of mdPool) {
    if (seen.has(md.id) || !md.poster) continue;
    const art = findAniListArt(md, anilist);
    out.push(art ? withAniListArt(md, art) : md);
    seen.add(md.id);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Discover catalog: AniList for HD covers when titles match, MangaDex as the
 * reliable spine so carousels never go blank.
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
  if (cached && Date.now() - cached.at < LIST_TTL_MS && cached.items.length > 0) {
    return cached.items;
  }

  const pending = listInFlight.get(cacheKey);
  if (pending) return pending;

  const run = (async () => {
    const includedTags = isGenreKind(ops.kind)
      ? [MANGA_GENRE_TAGS[ops.kind]]
      : undefined;

    const mdPromise = listManga({
      order: mdOrderFor(ops.kind),
      limit: Math.max(limit * 2, 48),
      offset: page > 1 ? (page - 1) * limit : 0,
      includeStats: false,
      includedTags,
    }).catch(() => [] as MangaListItem[]);

    const alPromise = listAniListManga({
      kind: ops.kind,
      limit,
      page,
    }).catch(() => [] as AniListMangaHit[]);

    const [anilist, mdPool] = await Promise.all([alPromise, mdPromise]);

    // AniList down / empty → MangaDex-only (pre-AniList carousel behavior).
    if (anilist.length === 0) {
      const items = mdPool.filter((item) => item.poster).slice(0, limit);
      if (items.length > 0) {
        listCache.set(cacheKey, { at: Date.now(), items });
      }
      return items;
    }

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
      const ids = await resolveDiscoverMangaIds(needResolve, 6, 3500);
      for (const hit of needResolve) {
        const id = ids.get(hit.title);
        if (!id) continue;
        byAniTitle.set(hit.title, anilistHitToListItem(hit, id));
      }
    }

    let items: MangaListItem[] = [];
    const seen = new Set<string>();
    for (const hit of anilist) {
      const item = byAniTitle.get(hit.title);
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
      if (items.length >= limit) break;
    }

    // Title mismatch / resolve budget → backfill from the MD pool so rows
    // never collapse to zero (which hid every manga carousel).
    items = fillFromMdPool(items, mdPool, anilist, limit);

    // Never cache empty — a poisoned empty entry blanked the tab for 15m.
    if (items.length > 0) {
      listCache.set(cacheKey, { at: Date.now(), items });
    }
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

/** Warm AniList + MD popular without blocking on id resolve. */
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
