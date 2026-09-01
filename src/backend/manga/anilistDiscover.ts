import { ofetch } from "ofetch";

import { proxiedMangaUrl, requestNeverLanded } from "@/backend/manga/mangadex";
import { plainMangaDescription } from "@/backend/manga/plainMangaDescription";
import type { MangaGenreTagKey } from "@/backend/manga/mangaTags";
import type {
  MangaContentRating,
  MangaListItem,
  MangaStatus,
} from "@/backend/manga/types";
import { getProxyUrls } from "@/utils/hosting/proxyUrls";
import {
  filterOutMatureMedia,
  shouldAllowMatureTitles,
} from "@/utils/media/mature";

const ANILIST = "https://graphql.anilist.co";

export type AniListMangaSort =
  | "POPULARITY_DESC"
  | "SCORE_DESC"
  | "UPDATED_AT_DESC"
  | "START_DATE_DESC"
  | "TRENDING_DESC";

export type AniListDiscoverKind =
  | "popular"
  | "topRated"
  | "latest"
  | "recentlyAdded"
  | MangaGenreTagKey;

const KIND_SORT: Record<
  "popular" | "topRated" | "latest" | "recentlyAdded",
  AniListMangaSort
> = {
  popular: "POPULARITY_DESC",
  topRated: "SCORE_DESC",
  latest: "UPDATED_AT_DESC",
  recentlyAdded: "START_DATE_DESC",
};

const GENRE_LABEL: Record<MangaGenreTagKey, string> = {
  action: "Action",
  romance: "Romance",
  fantasy: "Fantasy",
  comedy: "Comedy",
  drama: "Drama",
  sliceOfLife: "Slice of Life",
};

type AniListTitle = {
  romaji?: string | null;
  english?: string | null;
  native?: string | null;
};

type AniListMedia = {
  id: number;
  title?: AniListTitle | null;
  description?: string | null;
  bannerImage?: string | null;
  coverImage?: { extraLarge?: string | null; large?: string | null } | null;
  averageScore?: number | null;
  status?: string | null;
  isAdult?: boolean | null;
  startDate?: { year?: number | null } | null;
  genres?: string[] | null;
};

type PageResponse = {
  data?: {
    Page?: {
      media?: Array<AniListMedia | null> | null;
    } | null;
  } | null;
};

const gqlFetch = ofetch.create({ retry: 0, timeout: 12000 });
let proxyRequired = false;

const LIST_TTL_MS = 15 * 60 * 1000;
const listCache = new Map<string, { at: number; items: AniListMangaHit[] }>();
const listInFlight = new Map<string, Promise<AniListMangaHit[]>>();

export interface AniListMangaHit {
  anilistId: number;
  title: string;
  alternateTitles: string[];
  description?: string;
  /** High-res portrait cover (AniList CDN — no MangaDex proxy hop). */
  cover?: string;
  banner?: string;
  /** 0–10 scale to match MangaDex ratings. */
  rating?: number;
  year?: number;
  status: MangaStatus;
  adult: boolean;
  genres: string[];
}

async function postGraphql(body: string): Promise<PageResponse> {
  const init = {
    method: "POST" as const,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body,
  };
  const viaProxy = () => proxiedMangaUrl(ANILIST, getProxyUrls());

  if (proxyRequired) {
    const proxied = viaProxy();
    if (!proxied) throw new Error("No proxy configured for AniList requests");
    return gqlFetch<PageResponse>(proxied, init);
  }

  try {
    return await gqlFetch<PageResponse>(ANILIST, init);
  } catch (err) {
    const proxied = viaProxy();
    if (!proxied || !requestNeverLanded(err)) throw err;
    const result = await gqlFetch<PageResponse>(proxied, init);
    proxyRequired = true;
    return result;
  }
}

function pickTitle(title?: AniListTitle | null): string {
  if (!title) return "";
  return (title.english || title.romaji || title.native || "").trim();
}

function collectTitles(title?: AniListTitle | null): string[] {
  if (!title) return [];
  const out: string[] = [];
  for (const value of [title.english, title.romaji, title.native]) {
    const trimmed = value?.trim();
    if (trimmed && !out.includes(trimmed)) out.push(trimmed);
  }
  return out;
}

function stripAniListHtml(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?i>/gi, "")
    .replace(/<\/?b>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function parseStatus(raw?: string | null): MangaStatus {
  switch (raw) {
    case "RELEASING":
      return "ongoing";
    case "FINISHED":
      return "completed";
    case "HIATUS":
      return "hiatus";
    case "CANCELLED":
      return "cancelled";
    default:
      return "unknown";
  }
}

function mapMedia(media: AniListMedia): AniListMangaHit | null {
  const titles = collectTitles(media.title);
  const title = pickTitle(media.title);
  if (!title) return null;
  const cover =
    media.coverImage?.extraLarge?.trim() ||
    media.coverImage?.large?.trim() ||
    undefined;
  const descriptionRaw = media.description
    ? stripAniListHtml(media.description)
    : "";
  const description = descriptionRaw
    ? plainMangaDescription(descriptionRaw)
    : undefined;
  return {
    anilistId: media.id,
    title,
    alternateTitles: titles.filter((t) => t !== title),
    description: description || undefined,
    cover,
    banner: media.bannerImage?.trim() || undefined,
    rating:
      typeof media.averageScore === "number"
        ? media.averageScore / 10
        : undefined,
    year: media.startDate?.year ?? undefined,
    status: parseStatus(media.status),
    adult: media.isAdult === true,
    genres: (media.genres ?? []).filter(Boolean),
  };
}

function isGenreKind(kind: AniListDiscoverKind): kind is MangaGenreTagKey {
  return kind in GENRE_LABEL;
}

export function anilistSortForKind(kind: AniListDiscoverKind): AniListMangaSort {
  if (isGenreKind(kind)) return "POPULARITY_DESC";
  return KIND_SORT[kind];
}

export function anilistGenreForKind(
  kind: AniListDiscoverKind,
): string | undefined {
  if (!isGenreKind(kind)) return undefined;
  return GENRE_LABEL[kind];
}

/** AniList genre label for a MangaDex tag key (discover pill filter). */
export function anilistGenreLabel(key: MangaGenreTagKey): string {
  return GENRE_LABEL[key];
}

/**
 * Fast CORS-friendly manga catalog. Covers come from AniList's CDN at
 * extraLarge — much sharper than MangaDex's default 256px thumbs.
 */
export async function listAniListManga(ops: {
  kind: AniListDiscoverKind;
  limit?: number;
  page?: number;
  /** When set, filters every row by this AniList genre label. */
  genre?: string;
}): Promise<AniListMangaHit[]> {
  const limit = ops.limit ?? 24;
  const page = ops.page ?? 1;
  const sort = anilistSortForKind(ops.kind);
  const genre = ops.genre ?? anilistGenreForKind(ops.kind);
  const allowAdult = shouldAllowMatureTitles();
  const cacheKey = [ops.kind, sort, genre ?? "", limit, page, allowAdult].join(
    ":",
  );

  const cached = listCache.get(cacheKey);
  if (cached && Date.now() - cached.at < LIST_TTL_MS) return cached.items;

  const pending = listInFlight.get(cacheKey);
  if (pending) return pending;

  const run = (async () => {
    const body = JSON.stringify({
      query: `query (
        $page: Int,
        $perPage: Int,
        $sort: [MediaSort],
        $genre: String,
        $isAdult: Boolean
      ) {
        Page(page: $page, perPage: $perPage) {
          media(
            type: MANGA
            sort: $sort
            genre: $genre
            isAdult: $isAdult
          ) {
            id
            title { romaji english native }
            description
            bannerImage
            coverImage { extraLarge large }
            averageScore
            status
            isAdult
            startDate { year }
            genres
          }
        }
      }`,
      variables: {
        page,
        perPage: limit,
        sort: [sort],
        genre: genre ?? null,
        // When mature is off, force non-adult. When on, omit the filter.
        isAdult: allowAdult ? null : false,
      },
    });

    const res = await postGraphql(body);
    const raw = (res.data?.Page?.media ?? [])
      .filter((m): m is AniListMedia => Boolean(m))
      .map(mapMedia)
      .filter((m): m is AniListMangaHit => Boolean(m));
    const items = filterOutMatureMedia(raw);
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

export function anilistHitToListItem(
  hit: AniListMangaHit,
  mangaId: string,
): MangaListItem {
  const contentRating: MangaContentRating = hit.adult
    ? "pornographic"
    : "safe";
  return {
    id: mangaId,
    title: hit.title,
    description: hit.description,
    poster: hit.cover,
    year: hit.year,
    status: hit.status,
    contentRating,
    tags: hit.genres.map((name) => ({ id: name, name })),
    adult: hit.adult,
    rating: hit.rating,
    alternateTitles:
      hit.alternateTitles.length > 0 ? hit.alternateTitles : undefined,
    readingDirection: "rtl",
  };
}

/** Warm the first few discover rows so the manga tab isn't cold. */
export function prefetchMangaDiscover(): void {
  const kinds: AniListDiscoverKind[] = [
    "popular",
    "latest",
    "topRated",
    "recentlyAdded",
  ];
  for (const kind of kinds) {
    void listAniListManga({ kind, limit: 24 }).catch(() => undefined);
  }
}
