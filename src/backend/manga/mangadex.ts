import { ofetch } from "ofetch";

import { sortMangaLanguages } from "@/backend/manga/languages";
import { plainMangaDescription } from "@/backend/manga/plainMangaDescription";
import {
  MangaAtHome,
  MangaChapter,
  MangaChapterGroup,
  MangaContentRating,
  MangaDetails,
  MangaListItem,
  MangaReadingDirection,
  MangaStatus,
  MangaTag,
  isMatureMangaRating,
} from "@/backend/manga/types";
import { getProxyUrls } from "@/utils/hosting/proxyUrls";
import { filterOutMatureMedia } from "@/utils/media/mature";

const API = "https://api.mangadex.org";
const COVER_CDN = "https://uploads.mangadex.org";

type MdRelationship = {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
};

type MdMangaAttributes = {
  title: Record<string, string>;
  altTitles?: Array<Record<string, string>>;
  description?: Record<string, string>;
  status?: string;
  year?: number | null;
  contentRating?: string;
  originalLanguage?: string;
  lastChapter?: string | null;
  availableTranslatedLanguages?: string[];
  tags?: Array<{
    id: string;
    attributes?: { name?: Record<string, string> };
  }>;
};

type MdManga = {
  id: string;
  attributes: MdMangaAttributes;
  relationships?: MdRelationship[];
};

type MdChapterAttributes = {
  volume?: string | null;
  chapter?: string | null;
  title?: string | null;
  pages?: number;
  translatedLanguage?: string;
  publishAt?: string;
  externalUrl?: string | null;
};

type MdChapter = {
  id: string;
  attributes: MdChapterAttributes;
};

type MdListResponse<T> = {
  result: string;
  data: T[];
  total?: number;
};

type MdEntityResponse<T> = {
  result: string;
  data: T;
};

type MdStats = {
  statistics: Record<
    string,
    {
      follows?: number;
      rating?: { average?: number | null; bayesian?: number | null };
    }
  >;
};

type MdAggregate = {
  result: string;
  volumes: Record<
    string,
    {
      volume: string;
      chapters: Record<
        string,
        {
          chapter: string;
          id: string;
          others?: string[];
        }
      >;
    }
  >;
};

type MdAtHome = {
  result: string;
  baseUrl: string;
  chapter: {
    hash: string;
    data: string[];
    dataSaver: string[];
  };
};

export type MangaOrder =
  | "followedCount"
  | "rating"
  | "latestUploadedChapter"
  | "createdAt";

const mdFetch = ofetch.create({
  retry: 1,
  timeout: 20000,
});

/**
 * MangaDex reflects CORS headers only for localhost and its own site, so a
 * browser on any real domain has its response thrown away. Extensions and the
 * desktop app aren't bound by that, so try direct first and fall back to our
 * proxy, remembering the answer for the rest of the session.
 */
let proxyRequired = false;

export function proxiedMangaUrl(
  url: string,
  proxies: string[],
): string | undefined {
  const proxy = proxies[0];
  if (!proxy) return undefined;
  // No slash before the query: our own /api/proxy route doesn't match with a
  // trailing slash and the request lands on the SPA's index.html instead.
  const separator = proxy.includes("?") ? "&" : "?";
  return `${proxy}${separator}destination=${encodeURIComponent(url)}`;
}

/** ofetch only attaches `response` to HTTP errors; without one the request never landed. */
export function requestNeverLanded(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  return (err as { response?: unknown }).response === undefined;
}

/** MangaDex wants repeated `key[]=` params; ofetch's default array form differs. */
function mdQuery(params: Record<string, string | string[] | number | boolean>) {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const v of value) sp.append(key, String(v));
    } else {
      sp.append(key, String(value));
    }
  }
  return sp.toString();
}

async function mdGet<T>(
  path: string,
  params: Record<string, string | string[] | number | boolean> = {},
): Promise<T> {
  const qs = mdQuery(params);
  const url = `${API}${qs ? `${path}?${qs}` : path}`;
  const viaProxy = () => proxiedMangaUrl(url, getProxyUrls());

  if (proxyRequired) {
    const proxied = viaProxy();
    if (!proxied) throw new Error("No proxy configured for MangaDex requests");
    return mdFetch<T>(proxied);
  }

  try {
    return await mdFetch<T>(url, { retry: 0 });
  } catch (err) {
    const proxied = viaProxy();
    if (!proxied || !requestNeverLanded(err)) throw err;
    const result = await mdFetch<T>(proxied);
    proxyRequired = true;
    return result;
  }
}

function pickLocalized(
  map: Record<string, string> | undefined,
  prefer = ["en", "ja-ro", "ja"],
): string {
  if (!map) return "";
  for (const key of prefer) {
    if (map[key]?.trim()) return map[key].trim();
  }
  const first = Object.values(map).find((v) => v?.trim());
  return first?.trim() ?? "";
}

/**
 * MangaDex's primary title is almost always the romanised original ("Sono
 * Bisque Doll wa Koi o Suru"); the official English name ("My Dress-Up
 * Darling") sits in altTitles. Prefer a genuine English title, then the
 * primary title's own English entry, and only fall back to the romaji.
 */
export function pickMangaTitle(attrs: MdMangaAttributes): string {
  const primaryEn = attrs.title?.en?.trim();
  if (primaryEn) return primaryEn;
  const altEn = (attrs.altTitles ?? [])
    .map((alt) => alt.en?.trim())
    .find((value) => value);
  if (altEn) return altEn;
  return pickLocalized(attrs.title);
}

function coverFileName(manga: MdManga): string | undefined {
  const cover = manga.relationships?.find((r) => r.type === "cover_art");
  const file = cover?.attributes?.fileName;
  return typeof file === "string" ? file : undefined;
}

function coverUrl(mangaId: string, fileName?: string, size: 256 | 512 = 256) {
  if (!fileName) return undefined;
  return `${COVER_CDN}/covers/${mangaId}/${fileName}.${size}.jpg`;
}

function parseStatus(raw?: string): MangaStatus {
  if (
    raw === "ongoing" ||
    raw === "completed" ||
    raw === "hiatus" ||
    raw === "cancelled"
  ) {
    return raw;
  }
  return "unknown";
}

function parseContentRating(raw?: string): MangaContentRating {
  if (
    raw === "safe" ||
    raw === "suggestive" ||
    raw === "erotica" ||
    raw === "pornographic"
  ) {
    return raw;
  }
  return "safe";
}

function readingDirectionFor(
  originalLanguage: string | undefined,
  tags: MangaTag[],
): MangaReadingDirection {
  const names = tags.map((t) => t.name.toLowerCase());
  if (names.some((n) => n.includes("long strip") || n.includes("webtoon"))) {
    return "ltr";
  }
  // Traditional manga / Japanese / Korean print-style → RTL page turns
  if (
    originalLanguage === "ja" ||
    originalLanguage === "ko" ||
    names.some((n) => n === "manga")
  ) {
    return "rtl";
  }
  return "ltr";
}

function mapTags(manga: MdManga): MangaTag[] {
  return (manga.attributes.tags ?? [])
    .map((t) => ({
      id: t.id,
      name: pickLocalized(t.attributes?.name) || t.id,
    }))
    .filter((t) => t.name);
}

function collectTitleHints(attrs: MdMangaAttributes): string[] {
  const hints: string[] = [];
  const add = (value?: string) => {
    const trimmed = value?.trim();
    if (trimmed && !hints.includes(trimmed)) hints.push(trimmed);
  };
  for (const value of Object.values(attrs.title ?? {})) {
    if (typeof value === "string") add(value);
  }
  for (const alt of attrs.altTitles ?? []) {
    for (const value of Object.values(alt)) {
      if (typeof value === "string") add(value);
    }
  }
  return hints;
}

function mapManga(
  manga: MdManga,
  stats?: { rating?: number; follows?: number },
): MangaListItem {
  const title = pickMangaTitle(manga.attributes);
  const descriptionRaw = pickLocalized(manga.attributes.description);
  const description = descriptionRaw
    ? plainMangaDescription(descriptionRaw)
    : "";
  const contentRating = parseContentRating(manga.attributes.contentRating);
  const tags = mapTags(manga);
  const originalLanguage = manga.attributes.originalLanguage;
  const alternateTitles = collectTitleHints(manga.attributes).filter(
    (hint) => hint !== title,
  );
  return {
    id: manga.id,
    title: title || "Untitled",
    description: description || undefined,
    poster: coverUrl(manga.id, coverFileName(manga)),
    year: manga.attributes.year ?? undefined,
    status: parseStatus(manga.attributes.status),
    contentRating,
    tags,
    adult: isMatureMangaRating(contentRating),
    rating: stats?.rating,
    follows: stats?.follows,
    lastChapter: manga.attributes.lastChapter ?? undefined,
    originalLanguage,
    readingDirection: readingDirectionFor(originalLanguage, tags),
    alternateTitles: alternateTitles.length > 0 ? alternateTitles : undefined,
    availableLanguages: (manga.attributes.availableTranslatedLanguages ?? [])
      .map((code) => code.trim())
      .filter(Boolean),
  };
}

/** Always request every rating from MangaDex; blur/18+ gating matches TMDB search. */
function contentRatingsQuery(): MangaContentRating[] {
  return ["safe", "suggestive", "erotica", "pornographic"];
}

async function fetchStatistics(
  ids: string[],
): Promise<Record<string, { rating?: number; follows?: number }>> {
  if (ids.length === 0) return {};
  const out: Record<string, { rating?: number; follows?: number }> = {};
  // MangaDex caps manga[] query size; chunk defensively.
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const res = await mdGet<MdStats>("/statistics/manga", {
      "manga[]": chunk,
    });
    for (const [id, stat] of Object.entries(res.statistics ?? {})) {
      out[id] = {
        rating: stat.rating?.bayesian ?? stat.rating?.average ?? undefined,
        follows: stat.follows,
      };
    }
  }
  return out;
}

function listQuery(
  order: MangaOrder,
  limit: number,
  offset = 0,
  includedTags: string[] = [],
) {
  const query: Record<string, string | string[] | number> = {
    limit,
    offset,
    "includes[]": ["cover_art"],
    "contentRating[]": contentRatingsQuery(),
    "availableTranslatedLanguage[]": ["en"],
    [`order[${order}]`]: "desc",
    hasAvailableChapters: "true",
  };
  if (includedTags?.length) {
    query["includedTags[]"] = includedTags;
  }
  return query;
}

const LIST_TTL_MS = 15 * 60 * 1000;
const listCache = new Map<string, { at: number; items: MangaListItem[] }>();
const listInFlight = new Map<string, Promise<MangaListItem[]>>();

export async function listManga(ops: {
  order: MangaOrder;
  limit?: number;
  offset?: number;
  /** Discover cards only need covers; skip the extra statistics round-trip. */
  includeStats?: boolean;
  /** MangaDex tag UUIDs — genre/theme filters for discover rows. */
  includedTags?: string[];
}): Promise<MangaListItem[]> {
  const limit = ops.limit ?? 24;
  const offset = ops.offset ?? 0;
  const includeStats = ops.includeStats !== false;
  const includedTags = ops.includedTags ?? [];
  const cacheKey = [
    ops.order,
    limit,
    offset,
    includeStats,
    includedTags.join(","),
    contentRatingsQuery().join(","),
  ].join(":");

  const cached = listCache.get(cacheKey);
  if (cached && Date.now() - cached.at < LIST_TTL_MS) return cached.items;

  const pending = listInFlight.get(cacheKey);
  if (pending) return pending;

  const run = (async () => {
    const res = await mdGet<MdListResponse<MdManga>>(
      "/manga",
      listQuery(ops.order, limit, offset, includedTags),
    );
    const stats = includeStats
      ? await fetchStatistics(res.data.map((m) => m.id))
      : {};
    const items = filterOutMatureMedia(
      res.data.map((m) => mapManga(m, stats[m.id])),
    );
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

export async function searchManga(
  title: string,
  limit = 24,
): Promise<MangaListItem[]> {
  const q = title.trim();
  if (!q) return [];
  const res = await mdGet<MdListResponse<MdManga>>("/manga", {
    title: q,
    limit,
    "includes[]": ["cover_art"],
    "contentRating[]": contentRatingsQuery(),
    "order[relevance]": "desc",
    hasAvailableChapters: "true",
  });
  const stats = await fetchStatistics(res.data.map((m) => m.id));
  const items = res.data.map((m) => mapManga(m, stats[m.id]));
  // Same as TMDB search: include adult hits; MediaCard blurs until opted in.
  return items;
}

function peopleNames(manga: MdManga, type: "author" | "artist"): string[] {
  return (manga.relationships ?? [])
    .filter((r) => r.type === type)
    .map((r) => {
      const name = r.attributes?.name;
      return typeof name === "string" ? name : "";
    })
    .filter(Boolean);
}

const aggregateCache = new Map<
  string,
  { at: number; chapters: MangaChapter[]; groups: MangaChapterGroup[] }
>();
const AGGREGATE_TTL_MS = 5 * 60 * 1000;

async function loadChapters(
  mangaId: string,
  preferredLanguage = "en",
): Promise<{ chapters: MangaChapter[]; groups: MangaChapterGroup[] }> {
  const cacheKey = `${mangaId}:${preferredLanguage}`;
  const cached = aggregateCache.get(cacheKey);
  if (cached && Date.now() - cached.at < AGGREGATE_TTL_MS) {
    return { chapters: cached.chapters, groups: cached.groups };
  }

  // Aggregate only has ids, so the feed is needed for titles/pages — but it
  // doesn't depend on the aggregate, and waiting for one then the other is most
  // of the delay before a title's info appears.
  const [agg, feed] = await Promise.all([
    mdGet<MdAggregate>(`/manga/${mangaId}/aggregate`, {
      "translatedLanguage[]": [preferredLanguage],
    }).catch(() => ({ result: "ok", volumes: {} } as MdAggregate)),
    mdGet<MdListResponse<MdChapter>>(`/manga/${mangaId}/feed`, {
      limit: 500,
      "translatedLanguage[]": [preferredLanguage],
      "order[volume]": "asc",
      "order[chapter]": "asc",
      "contentRating[]": contentRatingsQuery(),
    }).catch(() => ({ data: [] as MdChapter[] })),
  ]);

  const feedData = feed.data;

  const externalIds = new Set(
    feedData.filter((c) => c.attributes.externalUrl).map((c) => c.id),
  );
  const byId = new Map(
    feedData.filter((c) => !c.attributes.externalUrl).map((c) => [c.id, c]),
  );

  // Prefer aggregate order (one canonical chapter per number); fill from feed.
  const chapters: MangaChapter[] = [];
  const volumeOrder = Object.keys(agg.volumes ?? {}).sort((a, b) => {
    if (a === "none") return 1;
    if (b === "none") return -1;
    return Number(a) - Number(b);
  });

  for (const volKey of volumeOrder) {
    const vol = agg.volumes[volKey];
    const chapterKeys = Object.keys(vol.chapters ?? {}).sort(
      (a, b) => Number(a) - Number(b),
    );
    for (const chKey of chapterKeys) {
      const entry = vol.chapters[chKey];
      if (externalIds.has(entry.id)) continue;
      const full = byId.get(entry.id);
      // Aggregate can list ids that aren't in the feed (or are empty stubs).
      // Never surface those — they produce "no pages" in the reader.
      if (!full || (full.attributes.pages ?? 0) <= 0) continue;
      chapters.push({
        id: entry.id,
        volume: vol.volume === "none" ? null : vol.volume,
        chapter: entry.chapter === "none" ? null : entry.chapter,
        title: full.attributes.title ?? null,
        pages: full.attributes.pages ?? 0,
        translatedLanguage:
          full.attributes.translatedLanguage ?? preferredLanguage,
        publishAt: full.attributes.publishAt,
      });
    }
  }

  // If aggregate was empty, use feed as-is (skip external / empty stubs).
  if (chapters.length === 0) {
    for (const c of feedData) {
      if (c.attributes.externalUrl) continue;
      if ((c.attributes.pages ?? 0) <= 0) continue;
      chapters.push({
        id: c.id,
        volume: c.attributes.volume ?? null,
        chapter: c.attributes.chapter ?? null,
        title: c.attributes.title ?? null,
        pages: c.attributes.pages ?? 0,
        translatedLanguage:
          c.attributes.translatedLanguage ?? preferredLanguage,
        publishAt: c.attributes.publishAt,
      });
    }
  }

  const groupMap = new Map<string, MangaChapter[]>();
  for (const ch of chapters) {
    const key = ch.volume ?? "none";
    const list = groupMap.get(key) ?? [];
    list.push(ch);
    groupMap.set(key, list);
  }
  const groups: MangaChapterGroup[] = [...groupMap.entries()].map(
    ([volume, list]) => ({ volume, chapters: list }),
  );

  aggregateCache.set(cacheKey, { at: Date.now(), chapters, groups });
  return { chapters, groups };
}

const detailsCache = new Map<string, { at: number; details: MangaDetails }>();
const DETAILS_TTL_MS = 5 * 60 * 1000;

export async function getMangaDetails(
  mangaId: string,
  preferredLanguage = "en",
): Promise<MangaDetails> {
  const cacheKey = `${mangaId}:${preferredLanguage}`;
  const cached = detailsCache.get(cacheKey);
  if (cached && Date.now() - cached.at < DETAILS_TTL_MS) return cached.details;

  // None of these depend on each other, and run in sequence they were the whole
  // wait between clicking a title and seeing it.
  const [res, stats, { chapters, groups }] = await Promise.all([
    mdGet<MdEntityResponse<MdManga>>(`/manga/${mangaId}`, {
      "includes[]": ["cover_art", "author", "artist"],
    }),
    fetchStatistics([mangaId]),
    loadChapters(mangaId, preferredLanguage),
  ]);
  const base = mapManga(res.data, stats[mangaId]);
  const details: MangaDetails = {
    ...base,
    authors: peopleNames(res.data, "author"),
    artists: peopleNames(res.data, "artist"),
    chapters,
    chapterGroups: groups,
    availableLanguages: sortMangaLanguages([
      ...(base.availableLanguages ?? []),
      ...chapters.map((ch) => ch.translatedLanguage),
    ]),
  };
  detailsCache.set(cacheKey, { at: Date.now(), details });
  return details;
}

const AT_HOME_TTL_MS = 10 * 60 * 1000;
const atHomeCache = new Map<string, { at: number; value: MangaAtHome }>();
const atHomeInFlight = new Map<string, Promise<MangaAtHome>>();

export async function getChapterAtHome(
  chapterId: string,
  force = false,
): Promise<MangaAtHome> {
  if (!force) {
    const cached = atHomeCache.get(chapterId);
    if (cached && Date.now() - cached.at < AT_HOME_TTL_MS) {
      return cached.value;
    }
    const inflight = atHomeInFlight.get(chapterId);
    if (inflight) return inflight;
  } else {
    atHomeCache.delete(chapterId);
  }

  const promise = (async () => {
    const res = await mdGet<MdAtHome>(`/at-home/server/${chapterId}`, {
      forcePort443: "true",
    });
    const value: MangaAtHome = {
      baseUrl: res.baseUrl,
      hash: res.chapter.hash,
      data: res.chapter.data ?? [],
      dataSaver: res.chapter.dataSaver ?? [],
    };
    atHomeCache.set(chapterId, { at: Date.now(), value });
    return value;
  })();

  atHomeInFlight.set(chapterId, promise);
  try {
    return await promise;
  } finally {
    atHomeInFlight.delete(chapterId);
  }
}

/** Full-quality page URLs; caller may fall back to data-saver. */
export function chapterPageUrls(
  atHome: MangaAtHome,
  quality: "data" | "data-saver" = "data",
): string[] {
  const files = quality === "data" ? atHome.data : atHome.dataSaver;
  const folder = quality === "data" ? "data" : "data-saver";
  return files.map(
    (file) => `${atHome.baseUrl}/${folder}/${atHome.hash}/${file}`,
  );
}

/** MangaDex CDN blocks hotlinks from our origin — route pages through /api/proxy. */
export function proxiedChapterPageUrls(urls: string[]): string[] {
  if (typeof window === "undefined") return urls;
  const proxies = getProxyUrls();
  if (!proxies.length) return urls;
  return urls.map((url) => proxiedMangaUrl(url, proxies) ?? url);
}

export function chapterLabel(ch: MangaChapter): string {
  if (ch.chapter) {
    return ch.title
      ? `Ch. ${ch.chapter} — ${ch.title}`
      : `Chapter ${ch.chapter}`;
  }
  return ch.title || "Oneshot";
}

/** Short form for the corner of a cover, where a show would say "S1 E2". */
export function chapterBadge(label: string): string {
  const number = /ch(?:apter)?\.?\s*([\d.]+)/i.exec(label);
  if (number) return `Ch. ${number[1]}`;
  return label.length > 12 ? `${label.slice(0, 11)}…` : label;
}

export function mangaToMediaItem(item: MangaListItem) {
  return {
    id: item.id,
    title: item.title,
    year: item.year,
    poster: item.poster,
    type: "manga" as const,
    adult: item.adult,
  };
}
