import { ofetch } from "ofetch";

import { proxiedMangaUrl } from "@/backend/manga/mangadex";
import { fetchViaMangaProxies } from "@/backend/manga/proxyCandidates";
import {
  buildFallbackSearchQueries,
  pickBestSeriesHit,
  titlesCompatible,
} from "@/backend/manga/weebcentral";
import {
  getMangaSeeChapterPages,
  resolveMangaSeeSlug,
} from "@/backend/manga/sources/mangasee";
import { getProxyUrls } from "@/utils/hosting/proxyUrls";

import type { MangaChapter } from "@/backend/manga/types";

const API = "https://api.comick.dev";
const IMAGE_CDN = "https://meo.comick.pictures";

interface ComickSearchHit {
  hid: string;
  title: string;
  slug?: string;
}

interface ComickChapterRow {
  hid: string;
  chap: string | null;
  vol: string | null;
  title: string | null;
  lang: string;
  group_name?: string[];
  external_type?: string | null;
  up_count?: number;
}

interface ComickChapterImage {
  b2key: string | null;
  w?: number | null;
}

interface ComickLink2 {
  id: string;
  slug?: string;
  enable?: boolean;
}

interface ComickChapterDetail {
  chap?: string | null;
  hid?: string;
  md_images?: ComickChapterImage[];
  md_comics?: { links2?: ComickLink2[] };
  dupGroupChapters?: { hid: string }[];
}

const ckFetch = ofetch.create({
  retry: 0,
  timeout: 20000,
  headers: {
    accept: "application/json",
    "User-Agent": "Tachiyomi",
    "x-origin": "https://comick.io",
  },
});

async function ckGet<T>(path: string): Promise<T> {
  const url = `${API}${path}`;
  return fetchViaMangaProxies(url, async (target) => ckFetch<T>(target));
}

export function comickChapterId(hid: string): string {
  return `comick-${hid}`;
}

export function isComickChapterId(id: string): boolean {
  return id.startsWith("comick-");
}

export function comickChapterHid(id: string): string | null {
  if (!isComickChapterId(id)) return null;
  return id.slice("comick-".length) || null;
}

function chapterScore(row: ComickChapterRow): number {
  let score = row.up_count ?? 0;
  const groups = row.group_name ?? [];
  if (groups.some((g) => /mangaplus|official|colored/i.test(g))) score -= 100;
  if (row.external_type) score -= 80;
  if (groups.some((g) => /tcb|scan|panda|potteto|group/i.test(g))) score += 30;
  return score;
}

const comickAlternateHids = new Map<string, string[]>();
const RESOLVED_CHAPTERS_TTL_MS = 5 * 60 * 1000;
const resolvedComickCache = new Map<
  string,
  { at: number; chapters: MangaChapter[] | null }
>();

function resolvedComickKey(title: string, alternateTitles: string[]) {
  return [
    title.trim().toLowerCase(),
    ...alternateTitles.map((alt) => alt.trim().toLowerCase()).sort(),
  ].join("|");
}

function dedupeComickChapters(rows: ComickChapterRow[]): ComickChapterRow[] {
  const byNum = new Map<string, { primary: ComickChapterRow; alts: string[] }>();
  for (const row of rows) {
    if (!row.chap?.trim()) continue;
    const key = row.chap.trim();
    const existing = byNum.get(key);
    if (!existing) {
      byNum.set(key, { primary: row, alts: [] });
      continue;
    }
    if (chapterScore(row) > chapterScore(existing.primary)) {
      byNum.set(key, {
        primary: row,
        alts: [existing.primary.hid, ...existing.alts],
      });
    } else if (existing.primary.hid !== row.hid) {
      existing.alts.push(row.hid);
    }
  }
  comickAlternateHids.clear();
  for (const { primary, alts } of byNum.values()) {
    if (alts.length > 0) {
      comickAlternateHids.set(primary.hid, alts);
    }
  }
  return [...byNum.values()].map((v) => v.primary);
}

export function getComickAlternateHids(hid: string): string[] {
  return comickAlternateHids.get(hid) ?? [];
}

async function fetchComickChapters(comicHid: string, lang: string) {
  const rows: ComickChapterRow[] = [];
  let page = 1;
  for (;;) {
    const res = await ckGet<{ chapters: ComickChapterRow[]; total?: number }>(
      `/comic/${comicHid}/chapters?lang=${encodeURIComponent(lang)}&limit=500&chap-order=1&page=${page}&tachiyomi=true`,
    );
    rows.push(...(res.chapters ?? []));
    if (!res.chapters?.length || rows.length >= (res.total ?? rows.length)) {
      break;
    }
    page += 1;
    if (page > 20) break;
  }
  return dedupeComickChapters(rows);
}

function toMangaChapters(rows: ComickChapterRow[]): MangaChapter[] {
  return rows
    .filter((row) => row.chap?.trim())
    .map((row) => ({
      id: comickChapterId(row.hid),
      volume: row.vol ?? null,
      chapter: row.chap,
      title: row.title,
      pages: 0,
      translatedLanguage: row.lang || "en",
      source: "comick" as const,
    }))
    .sort((a, b) => {
      const na = parseFloat(a.chapter ?? "");
      const nb = parseFloat(b.chapter ?? "");
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return (a.chapter ?? "").localeCompare(b.chapter ?? "", undefined, {
        numeric: true,
      });
    });
}

async function loadComickMatch(
  query: string,
): Promise<{ hid: string; title: string; chapters: MangaChapter[] } | null> {
  const q = query.trim();
  if (!q) return null;
  const hits = await ckGet<ComickSearchHit[]>(
    `/v1.0/search/?type=comic&showall=true&q=${encodeURIComponent(q)}&t=true`,
  );
  const mapped = hits.map((hit) => ({
    id: hit.hid,
    slug: hit.slug ?? "",
    title: hit.title,
  }));
  const match = pickBestSeriesHit(q, mapped);
  if (!match) return null;
  const rows = await fetchComickChapters(match.id, "en");
  if (rows.length === 0) return null;
  return {
    hid: match.id,
    title: match.title,
    chapters: toMangaChapters(rows),
  };
}

export async function resolveComickChapters(
  title: string,
  alternateTitles: string[] = [],
): Promise<MangaChapter[] | null> {
  const cacheKey = resolvedComickKey(title, alternateTitles);
  const cached = resolvedComickCache.get(cacheKey);
  if (cached && Date.now() - cached.at < RESOLVED_CHAPTERS_TTL_MS) {
    return cached.chapters;
  }

  const queries = buildFallbackSearchQueries(title, alternateTitles);
  let best: MangaChapter[] | null = null;
  for (const query of queries) {
    const hit = await loadComickMatch(query).catch(() => null);
    if (!hit) continue;
    if (!titlesCompatible(title, hit.title, alternateTitles)) continue;
    if (!best || hit.chapters.length > best.length) {
      best = hit.chapters;
    }
    if (best.length >= 80) break;
  }

  resolvedComickCache.set(cacheKey, { at: Date.now(), chapters: best });
  return best;
}

function mangaseeSlugFromDetail(detail: ComickChapterDetail | undefined): string | null {
  const links = detail?.md_comics?.links2 ?? [];
  const hit = links.find((link) => link.id === "mangasee" && link.enable !== false);
  return hit?.slug?.trim() || null;
}

function pagesFromDetail(detail: ComickChapterDetail | undefined): string[] {
  const images = detail?.md_images ?? [];
  const urls = images
    .map((img) => img.b2key)
    .filter((key): key is string => Boolean(key))
    .map((key) => `${IMAGE_CDN}/${key}`);
  if (urls.length === 0) return [];
  const proxies = getProxyUrls();
  return urls.map((url) => proxiedMangaUrl(url, proxies) ?? url);
}

async function fetchComickChapterDetail(
  hid: string,
): Promise<ComickChapterDetail | undefined> {
  const res = await ckGet<{ chapter?: ComickChapterDetail }>(
    `/chapter/${hid}?tachiyomi=true`,
  );
  return res.chapter;
}

export async function getComickChapterPages(
  chapterId: string,
  fallback?: {
    title?: string;
    alternateTitles?: string[];
    chapter?: string | null;
  },
): Promise<string[]> {
  const hid = comickChapterHid(chapterId);
  if (!hid) return [];

  const detail = await fetchComickChapterDetail(hid);
  const direct = pagesFromDetail(detail);
  if (direct.length > 0) return direct;

  const altHids = [
    ...(detail?.dupGroupChapters?.map((row) => row.hid) ?? []),
    ...getComickAlternateHids(hid),
  ].filter((altHid) => altHid && altHid !== hid);

  const altPages = await Promise.all(
    altHids.map(async (altHid) => {
      const altDetail = await fetchComickChapterDetail(altHid);
      return pagesFromDetail(altDetail);
    }),
  );
  for (const pages of altPages) {
    if (pages.length > 0) return pages;
  }

  const chapterNum = fallback?.chapter?.trim() || detail?.chap?.trim();
  if (!chapterNum || !fallback?.title) return [];

  const mangaseeSlug = await resolveMangaSeeSlug(
    fallback.title,
    mangaseeSlugFromDetail(detail),
    fallback.alternateTitles ?? [],
  );
  if (!mangaseeSlug) return [];

  return getMangaSeeChapterPages(mangaseeSlug, chapterNum);
}
