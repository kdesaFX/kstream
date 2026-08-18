import { ofetch } from "ofetch";

import { isWeebCentralId } from "@/backend/manga/ids";
import { proxiedMangaUrl } from "@/backend/manga/mangadex";
import type {
  MangaChapter,
  MangaChapterGroup,
  MangaDetails,
  MangaListItem,
  MangaReadingDirection,
  MangaStatus,
} from "@/backend/manga/types";
import { getProxyUrls, resolveProxyUrl } from "@/utils/hosting/proxyUrls";
import {
  shouldAllowMatureTitles,
} from "@/utils/media/mature";

const ORIGIN = "https://weebcentral.com";
const COVER = "https://temp.compsci88.com/cover";

export interface WeebCentralSearchHit {
  id: string;
  slug: string;
  title: string;
  poster?: string;
}

const wcFetch = ofetch.create({
  retry: 0,
  timeout: 20000,
  parseResponse: (text) => text,
});

/** Cloudflare challenge pages and JSON proxy errors must not be treated as a series list. */
export function isUsableWeebCentralHtml(html: string): boolean {
  if (!html || html.length < 80) return false;
  const trimmed = html.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return false;
  if (
    /just a moment|cf-challenge|attention required|enable javascript/i.test(
      html,
    )
  ) {
    return false;
  }
  return /weebcentral\.com|\/chapters\/|chapter-images|planeptune/i.test(html);
}

function wcHeaders(htmx: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: htmx ? "*/*" : "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
  };
  if (htmx) headers["HX-Request"] = "true";
  return headers;
}

function candidateUrls(url: string): string[] {
  const out: string[] = [];
  const add = (value?: string) => {
    if (value && !out.includes(value)) out.push(value);
  };
  // Same-origin proxy first. Direct WeebCentral is CORS-blocked on the
  // deployed site, and a configured worker is often the wrong first hop.
  if (typeof window !== "undefined") {
    add(proxiedMangaUrl(url, [resolveProxyUrl("/api/proxy")]));
  }
  for (const proxy of getProxyUrls()) {
    add(proxiedMangaUrl(url, [proxy]));
  }
  add(url);
  return out;
}

async function wcGet(url: string, htmx = false): Promise<string> {
  const headers = wcHeaders(htmx);
  let lastError: unknown;
  for (const target of candidateUrls(url)) {
    try {
      const html = await wcFetch<string>(target, { headers });
      if (typeof html === "string" && isUsableWeebCentralHtml(html)) {
        return html;
      }
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("WeebCentral request failed");
}

export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();
}

export function normalizeMangaTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function coverUrl(id: string): string {
  return `${COVER}/normal/${id}.webp`;
}

function slugToTitle(slug: string): string {
  return decodeURIComponent(slug).replace(/-/g, " ").trim();
}

export function parseSearchResults(html: string): WeebCentralSearchHit[] {
  const byId = new Map<string, WeebCentralSearchHit>();
  const linkRe =
    /https:\/\/weebcentral\.com\/series\/([0-9A-HJKMNP-TV-Z]{26})\/([^"'<>\s]+)/gi;
  for (const match of html.matchAll(linkRe)) {
    const id = match[1];
    const slug = match[2];
    if (!isWeebCentralId(id) || byId.has(id)) continue;
    byId.set(id, {
      id,
      slug,
      title: slugToTitle(slug),
      poster: coverUrl(id),
    });
  }

  const titleRe =
    /https:\/\/weebcentral\.com\/series\/([0-9A-HJKMNP-TV-Z]{26})\/[^"]+" class="line-clamp-1[^"]*">([^<]+)</gi;
  for (const match of html.matchAll(titleRe)) {
    const hit = byId.get(match[1]);
    if (hit) hit.title = decodeHtmlEntities(match[2]);
  }

  return [...byId.values()];
}

export function parseChapterList(html: string): MangaChapter[] {
  const seen = new Set<string>();
  const chapters: MangaChapter[] = [];
  const re =
    /href="\/chapters\/([0-9A-HJKMNP-TV-Z]{26})"[^>]*>[\s\S]*?<span class="">([^<]*)<\/span>[\s\S]*?datetime="([^"]*)"/gi;
  for (const match of html.matchAll(re)) {
    const id = match[1];
    if (seen.has(id)) continue;
    seen.add(id);
    const raw = decodeHtmlEntities(match[2] ?? "");
    const number = /(?:chapter|ch\.?)\s*([\d.]+)/i.exec(raw);
    chapters.push({
      id,
      volume: null,
      chapter: number?.[1] ?? null,
      title: number
        ? raw.replace(number[0], "").replace(/^[\s—:-]+/, "") || null
        : raw || null,
      pages: 0,
      translatedLanguage: "en",
      publishAt: match[3],
      source: "weebcentral",
    });
  }
  // WeebCentral lists newest first; the reader walks the array as first → last.
  return chapters.reverse();
}

export function parseChapterImages(html: string): string[] {
  const urls: string[] = [];
  for (const match of html.matchAll(/\ssrc="(https:\/\/[^"]+)"/gi)) {
    const url = match[1];
    if (/broken_image|\/static\//i.test(url)) continue;
    if (!/\.(png|jpe?g|webp|gif)(\?|$)/i.test(url)) continue;
    urls.push(url);
  }
  return [...new Set(urls)];
}

function parseStrongList(html: string, label: string): string[] {
  const block = new RegExp(`<strong>${label}[\\s\\S]*?<\\/li>`, "i").exec(
    html,
  )?.[0];
  if (!block) return [];
  return [...block.matchAll(/>([^<]{1,80})<\/a>/g)]
    .map((m) => decodeHtmlEntities(m[1]).replace(/,$/, "").trim())
    .filter((name) => name && !/^(yes|no)$/i.test(name));
}

function parseStatus(html: string): MangaStatus {
  const raw = /included_status=([^"]+)"[^>]*>([^<]+)/i.exec(html)?.[2]?.trim();
  const value = (raw ?? "").toLowerCase();
  if (value === "complete" || value === "completed") return "completed";
  if (value === "ongoing") return "ongoing";
  if (value === "hiatus") return "hiatus";
  if (value === "canceled" || value === "cancelled") return "cancelled";
  return "unknown";
}

function parseTypeDirection(html: string): MangaReadingDirection {
  const type = /included_type=([^"]+)"[^>]*>([^<]+)/i.exec(html)?.[2]?.trim();
  if (type && /manga/i.test(type) && !/manhwa|manhua/i.test(type)) return "rtl";
  return "ltr";
}

export function parseSeriesPage(
  html: string,
  seriesId: string,
): Omit<MangaDetails, "chapters" | "chapterGroups"> {
  const title =
    decodeHtmlEntities(/<h1[^>]*>([^<]+)<\/h1>/i.exec(html)?.[1] ?? "") ||
    "Untitled";
  const description = decodeHtmlEntities(
    /<strong>Description<\/strong>\s*<p[^>]*>([\s\S]*?)<\/p>/i.exec(
      html,
    )?.[1] ?? "",
  );
  const yearRaw =
    /<strong>Released:\s*<\/strong>\s*<span>(\d{4})<\/span>/i.exec(html)?.[1];
  const adult = /adult=True/i.test(html);
  const tags = parseStrongList(html, "Tags").map((name) => ({
    id: name.toLowerCase(),
    name,
  }));
  const authors = parseStrongList(html, "Author");
  return {
    id: seriesId,
    title,
    description: description || undefined,
    poster: coverUrl(seriesId),
    year: yearRaw ? Number(yearRaw) : undefined,
    status: parseStatus(html),
    contentRating: adult ? "erotica" : "safe",
    tags,
    adult,
    originalLanguage: /included_type=Manhwa/i.test(html) ? "ko" : undefined,
    readingDirection: parseTypeDirection(html),
    authors,
    artists: authors,
  };
}

function groupChapters(chapters: MangaChapter[]): MangaChapterGroup[] {
  return [{ volume: "none", chapters }];
}

export function pickMatchingSeries(
  query: string,
  hits: WeebCentralSearchHit[],
): WeebCentralSearchHit | undefined {
  const needle = normalizeMangaTitle(query);
  if (!needle) return undefined;
  return hits.find((hit) => normalizeMangaTitle(hit.title) === needle);
}

function hitToListItem(hit: WeebCentralSearchHit): MangaListItem {
  return {
    id: hit.id,
    title: hit.title,
    poster: hit.poster,
    status: "unknown",
    contentRating: "safe",
    tags: [],
    adult: false,
    readingDirection: "ltr",
  };
}

const searchCache = new Map<
  string,
  { at: number; hits: WeebCentralSearchHit[] }
>();
const SEARCH_TTL_MS = 5 * 60 * 1000;

export async function searchWeebCentral(
  title: string,
  limit = 16,
): Promise<MangaListItem[]> {
  const q = title.trim();
  if (!q) return [];
  const key = q.toLowerCase();
  const cached = searchCache.get(key);
  const hits =
    cached && Date.now() - cached.at < SEARCH_TTL_MS
      ? cached.hits
      : await (async () => {
          const url = `${ORIGIN}/search/data?limit=${limit}&text=${encodeURIComponent(q)}&sort=Best%20Match&order=Descending&official=Any&display_mode=Full%20Display`;
          const html = await wcGet(url, true);
          const parsed = parseSearchResults(html);
          if (parsed.length > 0) {
            searchCache.set(key, { at: Date.now(), hits: parsed });
          }
          return parsed;
        })();

  const items = hits
    .filter((hit) => !/\(volume\)/i.test(hit.title))
    .slice(0, limit)
    .map(hitToListItem);
  return items;
}

const detailsCache = new Map<string, { at: number; details: MangaDetails }>();
const DETAILS_TTL_MS = 5 * 60 * 1000;

export async function getWeebCentralDetails(
  seriesId: string,
): Promise<MangaDetails> {
  const cached = detailsCache.get(seriesId);
  if (cached && Date.now() - cached.at < DETAILS_TTL_MS) return cached.details;

  const [page, chapterHtml] = await Promise.all([
    wcGet(`${ORIGIN}/series/${seriesId}`),
    wcGet(`${ORIGIN}/series/${seriesId}/full-chapter-list`, true),
  ]);
  const base = parseSeriesPage(page, seriesId);
  if (base.adult && !shouldAllowMatureTitles()) {
    throw new Error("Mature titles are hidden");
  }
  const chapters = parseChapterList(chapterHtml);
  const details: MangaDetails = {
    ...base,
    lastChapter: chapters.at(-1)?.chapter ?? undefined,
    chapters,
    chapterGroups: groupChapters(chapters),
  };
  detailsCache.set(seriesId, { at: Date.now(), details });
  return details;
}

/** Exact-title match only — a close-but-wrong series is worse than no chapters. */
export async function findWeebCentralChapters(
  title: string,
): Promise<MangaChapter[] | null> {
  const q = title.trim();
  if (!q) return null;
  const items = await searchWeebCentral(q, 8);
  const hits: WeebCentralSearchHit[] = items.map((item) => ({
    id: item.id,
    slug: "",
    title: item.title,
    poster: item.poster,
  }));
  const match = pickMatchingSeries(q, hits);
  if (!match) return null;
  const details = await getWeebCentralDetails(match.id);
  return details.chapters.length > 0 ? details.chapters : null;
}

export async function getWeebCentralChapterPages(
  chapterId: string,
): Promise<string[]> {
  const html = await wcGet(
    `${ORIGIN}/chapters/${chapterId}/images?is_prev=False&reading_style=long_strip`,
    true,
  );
  return parseChapterImages(html);
}
