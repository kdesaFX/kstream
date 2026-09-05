/**
 * Edge-safe mirror chapter resolution for /api/manga/chapters.
 * WeebCentral chapter lists are large (~300KB) and often exceed browser proxy
 * timeouts; resolving on the edge avoids the client proxy chain.
 */
import { DEFAULT_UA } from "./proxy-shared";

const WC_ORIGIN = "https://weebcentral.com";
const COMICK_API = "https://api.comick.dev";

const COMICK_HEADERS: Record<string, string> = {
  accept: "application/json",
  "User-Agent": "Tachiyomi",
  "x-origin": "https://comick.io",
};

export interface MirrorChapter {
  id: string;
  volume: string | null;
  chapter: string | null;
  title: string | null;
  pages: number;
  translatedLanguage: string;
  publishAt?: string;
  source: "weebcentral" | "comick";
}

export interface MirrorChapterGroup {
  volume: string;
  chapters: MirrorChapter[];
}

export interface MirrorChapterResult {
  chapters: MirrorChapter[];
  chapterGroups: MirrorChapterGroup[];
}

interface SearchHit {
  id: string;
  slug: string;
  title: string;
}

const SEARCH_STOP = new Set([
  "the",
  "with",
  "and",
  "our",
  "your",
  "my",
  "a",
  "an",
  "of",
  "to",
  "in",
  "on",
  "at",
  "for",
  "end",
]);

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slugToTitle(slug: string): string {
  return decodeURIComponent(slug).replace(/-/g, " ").trim();
}

function decodeHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function significantTokens(title: string): string[] {
  return title
    .replace(/[!?,.'’:]/g, " ")
    .split(/\s+/)
    .map((word) => word.toLowerCase())
    .filter((word) => word.length >= 4 && !SEARCH_STOP.has(word));
}

function titleSatisfiesQuery(query: string, candidate: string): boolean {
  const needle = normalizeTitle(query);
  const hay = normalizeTitle(candidate);
  if (!needle || !hay) return false;
  if (needle === hay) return true;
  if (hay.includes(needle)) return true;
  if (needle.includes(hay) && hay.length >= Math.min(needle.length, 12)) {
    return true;
  }
  const tokens = significantTokens(query);
  if (tokens.length === 0) return false;
  return tokens.every((token) => hay.includes(token));
}

function titlesCompatible(
  wanted: string,
  candidate: string,
  alternateTitles: string[],
): boolean {
  if (/doujin|fan.?colored|anthology|oneshot|spin.?off/i.test(candidate)) {
    return false;
  }
  if (titleSatisfiesQuery(wanted, candidate)) return true;
  return alternateTitles.some((alt) => titleSatisfiesQuery(alt, candidate));
}

function buildQueries(title: string, alternateTitles: string[]): string[] {
  const out: string[] = [];
  const add = (value?: string) => {
    const trimmed = value?.trim();
    if (trimmed && !out.includes(trimmed)) out.push(trimmed);
  };

  add(title);
  add(title.replace(/-/g, " "));
  add(title.replace(/[!?,.'’:]/g, ""));

  const latinAlts = alternateTitles.filter((alt) => /[a-z]/i.test(alt));
  // Prefer short romaji prefixes before long English names — WC's /search/data
  // misses "My Dress-Up Darling" but finds "Sono Bisque Doll".
  const romajiFirst = [...latinAlts].sort((a, b) => {
    const score = (s: string) =>
      /\b(wa|wo|ha|no|ga|ni|sono)\b/i.test(s) ? 1 : 0;
    return score(b) - score(a);
  });

  for (const alt of romajiFirst) {
    const words = alt.replace(/[!?,.'’:]/g, " ").split(/\s+/).filter(Boolean);
    if (words.length >= 2) add(words.slice(0, 2).join(" "));
    if (words.length >= 3) add(words.slice(0, 3).join(" "));
  }
  for (const alt of romajiFirst) {
    add(alt);
  }

  const words = title.replace(/[!?,.'’:]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length >= 2) add(words.slice(0, 2).join(" "));
  if (words.length >= 3) add(words.slice(0, 3).join(" "));
  const distinctive = words.find((word) => word.length >= 6);
  if (distinctive && normalizeTitle(distinctive) !== normalizeTitle(title)) {
    add(distinctive);
  }
  return out.slice(0, 14);
}

function parseSearchResults(html: string): SearchHit[] {
  const byId = new Map<string, SearchHit>();
  const linkRe =
    /https:\/\/weebcentral\.com\/series\/([0-9A-HJKMNP-TV-Z]{26})\/([^"'<>\s]+)/gi;
  for (const match of html.matchAll(linkRe)) {
    const id = match[1];
    const slug = match[2];
    if (byId.has(id)) continue;
    byId.set(id, { id, slug, title: slugToTitle(slug) });
  }
  const titleRe =
    /https:\/\/weebcentral\.com\/series\/([0-9A-HJKMNP-TV-Z]{26})\/[^"]+" class="line-clamp-1[^"]*">([^<]+)</gi;
  for (const match of html.matchAll(titleRe)) {
    const hit = byId.get(match[1]);
    if (hit) hit.title = decodeHtml(match[2] ?? "");
  }
  return [...byId.values()];
}

function parseChapterList(html: string): MirrorChapter[] {
  const seen = new Set<string>();
  const chapters: MirrorChapter[] = [];
  const re =
    /href="\/chapters\/([0-9A-HJKMNP-TV-Z]{26})"[^>]*>[\s\S]*?<span class="">([^<]*)<\/span>[\s\S]*?datetime="([^"]*)"/gi;
  for (const match of html.matchAll(re)) {
    const id = match[1];
    if (seen.has(id)) continue;
    seen.add(id);
    const raw = decodeHtml(match[2] ?? "");
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
  return chapters.reverse();
}

function pickBestHit(query: string, hits: SearchHit[]): SearchHit | undefined {
  if (hits.length === 0) return undefined;
  const needle = normalizeTitle(query);
  const exact = hits.find(
    (hit) =>
      normalizeTitle(hit.title) === needle ||
      (hit.slug ? normalizeTitle(slugToTitle(hit.slug)) === needle : false),
  );
  if (exact) return exact;

  const ranked = hits
    .filter((hit) => titleSatisfiesQuery(query, hit.title))
    .sort((a, b) => b.title.length - a.title.length);
  return ranked[0];
}

async function wcGet(path: string, htmx = false): Promise<string> {
  const res = await fetch(`${WC_ORIGIN}${path}`, {
    headers: {
      Accept: htmx ? "*/*" : "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
      ...(htmx ? { "HX-Request": "true" } : {}),
      "User-Agent": DEFAULT_UA,
    },
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`WeebCentral ${res.status}`);
  const html = await res.text();
  if (/just a moment|cf-challenge|enable javascript/i.test(html)) {
    throw new Error("WeebCentral challenge page");
  }
  return html;
}

async function searchWeebCentralSimple(query: string): Promise<SearchHit[]> {
  const res = await fetch(`${WC_ORIGIN}/search/simple?location=main`, {
    method: "POST",
    headers: {
      Accept: "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": DEFAULT_UA,
    },
    body: `text=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) return [];
  const html = await res.text();
  if (/just a moment|cf-challenge|enable javascript/i.test(html)) {
    return [];
  }
  return parseSearchResults(html);
}

async function searchWeebCentral(query: string): Promise<SearchHit[]> {
  const url = `/search/data?limit=16&text=${encodeURIComponent(query)}&sort=Best%20Match&order=Descending&official=Any&display_mode=Full%20Display`;
  try {
    const html = await wcGet(url, true);
    const hits = parseSearchResults(html);
    if (hits.length > 0) return hits;
  } catch {
    // fall through to simple search
  }
  // /search/data often returns "No results" for English titles (Dress-Up Darling)
  // while /search/simple still finds the romaji series page.
  return searchWeebCentralSimple(query);
}

async function loadWeebCentralChapters(
  seriesId: string,
): Promise<MirrorChapter[]> {
  const html = await wcGet(`/series/${seriesId}/full-chapter-list`, true);
  const chapters = parseChapterList(html);
  if (chapters.length === 0) throw new Error("Empty WeebCentral chapter list");
  return chapters;
}

async function resolveWeebCentral(
  title: string,
  alternateTitles: string[],
): Promise<MirrorChapter[] | null> {
  const queries = buildQueries(title, alternateTitles);
  let best: MirrorChapter[] | null = null;
  for (const query of queries) {
    const hits = await searchWeebCentral(query).catch(() => []);
    const match = pickBestHit(query, hits);
    if (!match) continue;
    if (!titlesCompatible(title, match.title, alternateTitles)) continue;
    const chapters = await loadWeebCentralChapters(match.id).catch(() => null);
    if (!chapters?.length) continue;
    if (!best || chapters.length > best.length) best = chapters;
    if (best.length >= 80) break;
  }
  return best;
}

interface ComickSearchHit {
  hid: string;
  title: string;
}

interface ComickChapterRow {
  hid: string;
  chap: string | null;
  vol: string | null;
  title: string | null;
  lang: string;
}

async function ckGet<T>(path: string): Promise<T> {
  const res = await fetch(`${COMICK_API}${path}`, {
    headers: COMICK_HEADERS,
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Comick ${res.status}`);
  const text = await res.text();
  if (text.trimStart().startsWith("<")) {
    throw new Error("Comick challenge page");
  }
  return JSON.parse(text) as T;
}

async function fetchComickChapterRows(
  comicHid: string,
  lang: string,
): Promise<ComickChapterRow[]> {
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
  return rows;
}

function comickRowsToChapters(rows: ComickChapterRow[]): MirrorChapter[] {
  return rows
    .filter((row) => row.chap?.trim())
    .map((row) => ({
      id: `comick-${row.hid}`,
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

async function resolveComick(
  title: string,
  alternateTitles: string[],
  language: string,
): Promise<MirrorChapter[] | null> {
  const queries = buildQueries(title, alternateTitles);
  let best: MirrorChapter[] | null = null;
  for (const query of queries) {
    const hits = await ckGet<ComickSearchHit[]>(
      `/v1.0/search/?type=comic&showall=true&q=${encodeURIComponent(query)}&t=true`,
    ).catch(() => []);
    const mapped = hits.map((hit) => ({
      id: hit.hid,
      slug: "",
      title: hit.title,
    }));
    const match = pickBestHit(query, mapped);
    if (!match) continue;
    if (!titlesCompatible(title, match.title, alternateTitles)) continue;
    const rows = await fetchComickChapterRows(match.id, language).catch(
      () => [],
    );
    const chapters = comickRowsToChapters(rows);
    if (!chapters.length) continue;
    if (!best || chapters.length > best.length) best = chapters;
    if (best.length >= 80) break;
  }
  return best;
}

function mergeMirrorLists(lists: MirrorChapter[][]): MirrorChapter[] {
  const byNumber = new Map<string, MirrorChapter>();
  for (const list of lists) {
    for (const ch of list) {
      const key = ch.chapter?.trim() || ch.id;
      const existing = byNumber.get(key);
      if (!existing) {
        byNumber.set(key, ch);
        continue;
      }
      const prefer =
        existing.source === "weebcentral" || ch.source === "weebcentral"
          ? ch.source === "weebcentral"
            ? ch
            : existing
          : existing.source === "comick" || ch.source === "comick"
            ? ch.source === "comick"
              ? ch
              : existing
            : ch;
      byNumber.set(key, prefer);
    }
  }
  return [...byNumber.values()].sort((a, b) => {
    const na = parseFloat(a.chapter ?? "");
    const nb = parseFloat(b.chapter ?? "");
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return (a.chapter ?? "").localeCompare(b.chapter ?? "", undefined, {
      numeric: true,
    });
  });
}

export async function resolveMirrorChapters(
  title: string,
  alternateTitles: string[],
  language = "en",
): Promise<MirrorChapterResult> {
  const [wc, ck] = await Promise.all([
    resolveWeebCentral(title, alternateTitles).catch(() => null),
    resolveComick(title, alternateTitles, language).catch(() => null),
  ]);

  const merged = mergeMirrorLists(
    [wc ?? [], ck ?? []].filter((list) => list.length > 0),
  );
  return {
    chapters: merged,
    chapterGroups: [{ volume: "none", chapters: merged }],
  };
}
