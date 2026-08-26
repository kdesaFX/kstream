import { ofetch } from "ofetch";

import { isWeebCentralId } from "@/backend/manga/ids";
import { fetchViaMangaProxies } from "@/backend/manga/proxyCandidates";
import type {
  MangaChapter,
  MangaChapterGroup,
  MangaDetails,
  MangaListItem,
  MangaReadingDirection,
  MangaStatus,
} from "@/backend/manga/types";
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

async function wcGet(url: string, htmx = false): Promise<string> {
  const headers = wcHeaders(htmx);
  return fetchViaMangaProxies(
    url,
    async (target) => wcFetch<string>(target, { headers }),
    (html) => typeof html === "string" && isUsableWeebCentralHtml(html),
  );
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

export function seriesSlugFromPageUrl(url: string): string | null {
  const m = /\/manga\/([^/?#]+)\//i.exec(url);
  if (!m?.[1]) return null;
  return decodeURIComponent(m[1]).replace(/-/g, " ");
}

export function pagesBelongToTitle(
  pages: string[],
  title?: string,
  alternateTitles: string[] = [],
): boolean {
  if (!title || pages.length === 0) return true;
  const slug = pages.map(seriesSlugFromPageUrl).find(Boolean);
  if (!slug) return true;
  if (titlesCompatible(title, slug, alternateTitles)) return true;
  // Official CDNs often use the romaji folder name; accept when the distinctive
  // proper noun from the English title appears in the slug (Nagatoro, etc.).
  const tokens = significantTokens(title).filter(
    (token) => token.length >= 6 && !isGenericSearchToken(token),
  );
  if (tokens.length === 1) {
    const hay = normalizeMangaTitle(slug);
    if (hay.includes(tokens[0])) return true;
  }
  return false;
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
    availableLanguages: ["en"],
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
  return hits.find(
    (hit) =>
      normalizeMangaTitle(hit.title) === needle ||
      (hit.slug ? normalizeMangaTitle(slugToTitle(hit.slug)) === needle : false),
  );
}

const SEARCH_STOP_WORDS = new Set([
  "the",
  "with",
  "miss",
  "and",
  "our",
  "your",
  "my",
  "me",
  "dont",
  "don't",
  "a",
  "an",
  "of",
  "to",
  "in",
  "on",
  "at",
  "for",
]);

/** Standalone searches for these grab the wrong series ("Leveling" → Hardcore Leveling Warrior). */
const GENERIC_SEARCH_TOKENS = new Set([
  "leveling",
  "warrior",
  "hunter",
  "hero",
  "king",
  "queen",
  "love",
  "school",
  "girl",
  "girls",
  "boy",
  "boys",
  "world",
  "adventure",
  "chronicles",
  "legend",
  "story",
  "life",
  "death",
  "magic",
  "dragon",
  "sword",
  "battle",
  "fight",
  "knight",
  "demon",
  "devil",
  "angel",
  "another",
  "volume",
  "season",
  "reincarnated",
  "system",
  "player",
  "game",
  "quest",
  "dungeon",
  "tower",
  "return",
  "returned",
  "class",
  "rank",
  "ranked",
]);

function isGenericSearchToken(token: string): boolean {
  return GENERIC_SEARCH_TOKENS.has(token.toLowerCase());
}

function spinoffPenalty(title: string): number {
  const t = title.toLowerCase();
  if (/anthology|doujin|fan colored|spin.?off|side story|extra|omnibus/i.test(t)) {
    return 20;
  }
  if (/\(volume\)|\bvol\b|\bnovel\b/i.test(t)) {
    return 10;
  }
  return 0;
}

function significantTokens(title: string): string[] {
  return title
    .replace(/[!?,.'’]/g, " ")
    .split(/\s+/)
    .map((word) => word.toLowerCase())
    .filter((word) => word.length >= 4 && !SEARCH_STOP_WORDS.has(word));
}

function tokenOverlapScore(query: string, candidate: string): number {
  const queryTokens = significantTokens(query);
  if (queryTokens.length === 0) return 0;
  const candidateNorm = normalizeMangaTitle(candidate);
  return queryTokens.filter((token) => candidateNorm.includes(token)).length;
}

/** True when `candidate` is actually the series named by `query` (not a shared word). */
export function titleSatisfiesQuery(query: string, candidate: string): boolean {
  const needle = normalizeMangaTitle(query);
  const hay = normalizeMangaTitle(candidate);
  if (!needle || !hay) return false;
  if (needle === hay) return true;

  const queryTokens = significantTokens(query);
  if (
    queryTokens.length === 1 &&
    isGenericSearchToken(queryTokens[0]) &&
    significantTokens(candidate).length > 1
  ) {
    return false;
  }

  if (hay.includes(needle)) return true;
  if (needle.includes(hay) && hay.length >= Math.min(needle.length, 12)) {
    return true;
  }

  if (queryTokens.length === 0) return false;
  return queryTokens.every((token) => hay.includes(token));
}

export function titlesCompatible(
  wanted: string,
  candidate: string,
  alternateTitles: string[] = [],
): boolean {
  if (titleSatisfiesQuery(wanted, candidate)) return true;
  return alternateTitles.some((alt) => titleSatisfiesQuery(alt, candidate));
}

function hitMatchesQuery(query: string, hit: WeebCentralSearchHit): boolean {
  if (titleSatisfiesQuery(query, hit.title)) return true;
  if (hit.slug && titleSatisfiesQuery(query, slugToTitle(hit.slug))) return true;
  return false;
}

/** Pick the main series when exact-title match fails (licensed MD → WC fallback). */
export function pickBestSeriesHit(
  query: string,
  hits: WeebCentralSearchHit[],
): WeebCentralSearchHit | undefined {
  if (hits.length === 0) return undefined;
  const exact = pickMatchingSeries(query, hits);
  if (exact) return exact;

  const needle = normalizeMangaTitle(query);
  if (!needle) return undefined;

  const ranked = [...hits]
    .filter((hit) => hitMatchesQuery(query, hit))
    .sort((a, b) => {
      const score = (raw: string) => {
        const n = normalizeMangaTitle(raw);
        let s = spinoffPenalty(raw);
        if (n === needle) s -= 30;
        else if (n.includes(needle)) s -= 10;
        s -= tokenOverlapScore(query, raw) * 8;
        return s;
      };
      return score(a.title) - score(b.title);
    });

  return ranked[0];
}

/** WeebCentral search is ASCII-only and ignores kanji / other-script alts. */
export function isLatinSearchTitle(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 4) return false;
  return /[a-z]/i.test(trimmed) && /^[\x20-\x7E]+$/.test(trimmed);
}

function latinTitlePrefixes(value: string): string[] {
  const words = value
    .replace(/[!?,.'’]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length < 2) return [];
  const out: string[] = [];
  if (words.length >= 2) out.push(words.slice(0, 2).join(" "));
  if (words.length >= 3) out.push(words.slice(0, 3).join(" "));
  return out;
}

/** Romaji titles often differ by particle spelling across catalogs (wa/ha, o/wo). */
function romajiParticleVariants(value: string): string[] {
  const out: string[] = [];
  const add = (candidate: string) => {
    const trimmed = candidate.trim();
    if (trimmed && trimmed !== value.trim() && !out.includes(trimmed)) {
      out.push(trimmed);
    }
  };
  add(value.replace(/\bwa\b/gi, "ha"));
  add(value.replace(/\bha\b/gi, "wa"));
  add(value.replace(/\bKoi o\b/gi, "Koi wo"));
  add(value.replace(/\bo Suru\b/gi, "wo Suru"));
  return out;
}

function isRomajiLikeTitle(value: string): boolean {
  const normalized = normalizeMangaTitle(value);
  return (
    /\b(wa|wo|ha|no|ga|ni|de|to|e|sono|boku|kimi)\b/.test(normalized) ||
    normalized.split(/\s+/).length >= 5
  );
}

const MAX_FALLBACK_QUERIES = 4;

export function buildFallbackSearchQueries(
  title: string,
  alternateTitles: string[] = [],
): string[] {
  const out: string[] = [];
  const add = (value?: string) => {
    const trimmed = value?.trim();
    if (
      trimmed &&
      out.length < MAX_FALLBACK_QUERIES &&
      !out.some((q) => normalizeMangaTitle(q) === normalizeMangaTitle(trimmed))
    ) {
      out.push(trimmed);
    }
  };

  add(title);
  add(title.replace(/-/g, " "));
  add(title.replace(/[!?,.'’]/g, ""));
  for (const variant of romajiParticleVariants(title)) add(variant);

  const latinAlts = alternateTitles.filter(isLatinSearchTitle);
  const latinSearchOrder = [...latinAlts].sort(
    (a, b) => Number(isRomajiLikeTitle(b)) - Number(isRomajiLikeTitle(a)),
  );

  // Short romaji prefixes must run before long English alts — otherwise the
  // query budget is exhausted and WeebCentral never sees "Sono Bisque".
  for (const alt of latinSearchOrder) {
    for (const prefix of latinTitlePrefixes(alt)) add(prefix);
  }
  for (const prefix of latinTitlePrefixes(title)) add(prefix);

  for (const alt of latinSearchOrder) {
    add(alt);
    for (const variant of romajiParticleVariants(alt)) add(variant);
  }

  const tokens = title
    .replace(/[!?,.'’-]/g, " ")
    .split(/\s+/)
    .filter(
      (word) =>
        word.length >= 6 &&
        !SEARCH_STOP_WORDS.has(word.toLowerCase()) &&
        !isGenericSearchToken(word),
    )
    .sort((a, b) => b.length - a.length);
  const distinctive = tokens[0];
  if (
    distinctive &&
    normalizeMangaTitle(distinctive) !== normalizeMangaTitle(title)
  ) {
    add(distinctive);
  }

  return out;
}

interface ResolvedWeebCentralSeries {
  id: string;
  title: string;
  chapters: MangaChapter[];
}

async function loadWeebCentralMatch(
  query: string,
): Promise<ResolvedWeebCentralSeries | null> {
  const q = query.trim();
  if (!q) return null;
  const hits = await fetchWeebCentralSearchHits(q, 16);
  const match = pickBestSeriesHit(q, hits);
  if (!match) return null;
  const details = await getWeebCentralDetails(match.id);
  if (details.chapters.length === 0) return null;
  return {
    id: match.id,
    title: details.title || match.title,
    chapters: details.chapters,
  };
}

/**
 * Resolve readable chapters from WeebCentral when MangaDex is empty or
 * licensed-only. Tries the display title, romaji/alts, then one distinctive
 * proper-noun token. Never keeps the longest chapter list from an unrelated
 * series that merely shares a word ("Leveling").
 */
export async function resolveWeebCentralChapters(
  title: string,
  alternateTitles: string[] = [],
): Promise<MangaChapter[] | null> {
  const queries = buildFallbackSearchQueries(title, alternateTitles);
  for (const query of queries) {
    const hit = await loadWeebCentralMatch(query).catch(() => null);
    if (hit && titlesCompatible(title, hit.title, alternateTitles)) {
      return hit.chapters;
    }
  }
  return null;
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

async function fetchWeebCentralSearchHits(
  title: string,
  limit = 16,
): Promise<WeebCentralSearchHit[]> {
  const q = title.trim();
  if (!q) return [];
  const key = q.toLowerCase();
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.at < SEARCH_TTL_MS) {
    return cached.hits;
  }
  const url = `${ORIGIN}/search/data?limit=${limit}&text=${encodeURIComponent(q)}&sort=Best%20Match&order=Descending&official=Any&display_mode=Full%20Display`;
  const html = await wcGet(url, true);
  const parsed = parseSearchResults(html);
  if (parsed.length > 0) {
    searchCache.set(key, { at: Date.now(), hits: parsed });
  }
  return parsed;
}

export async function searchWeebCentral(
  title: string,
  limit = 16,
): Promise<MangaListItem[]> {
  const hits = await fetchWeebCentralSearchHits(title, limit);
  return hits
    .filter((hit) => !/\(volume\)/i.test(hit.title))
    .slice(0, limit)
    .map(hitToListItem);
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

/** @deprecated Prefer resolveWeebCentralChapters — kept for callers that only pass one title. */
export async function findWeebCentralChapters(
  title: string,
): Promise<MangaChapter[] | null> {
  return resolveWeebCentralChapters(title);
}

const pageCache = new Map<string, { at: number; pages: string[] }>();
const PAGE_TTL_MS = 10 * 60 * 1000;

export async function getWeebCentralChapterPages(
  chapterId: string,
): Promise<string[]> {
  const cached = pageCache.get(chapterId);
  if (cached && Date.now() - cached.at < PAGE_TTL_MS) return cached.pages;
  const html = await wcGet(
    `${ORIGIN}/chapters/${chapterId}/images?is_prev=False&reading_style=long_strip`,
    true,
  );
  const pages = parseChapterImages(html);
  if (pages.length > 0) {
    pageCache.set(chapterId, { at: Date.now(), pages });
  }
  return pages;
}

/** Last-resort page load when merged chapter ids (e.g. Comick) have no images. */
export async function getWeebCentralPagesForChapterNumber(
  title: string,
  alternateTitles: string[],
  chapterNum: string,
): Promise<string[]> {
  const wanted = chapterNum.trim();
  if (!wanted) return [];
  const chapters = await resolveWeebCentralChapters(title, alternateTitles).catch(
    () => null,
  );
  if (!chapters?.length) return [];
  const wantedNum = parseFloat(wanted);
  const match =
    chapters.find((ch) => ch.chapter?.trim() === wanted) ??
    (Number.isFinite(wantedNum)
      ? chapters.find((ch) => parseFloat(ch.chapter ?? "") === wantedNum)
      : undefined);
  if (!match) return [];
  return getWeebCentralChapterPages(match.id);
}
