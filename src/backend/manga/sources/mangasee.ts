import { ofetch } from "ofetch";

import { proxiedMangaUrl } from "@/backend/manga/mangadex";
import {
  buildFallbackSearchQueries,
  pickBestSeriesHit,
  titlesCompatible,
} from "@/backend/manga/weebcentral";
import { getProxyUrls, resolveProxyUrl } from "@/utils/hosting/proxyUrls";

const ORIGIN = "https://mangasee123.com";

interface MangaSeeSearchRow {
  i: string;
  s: string;
  a?: string[];
}

interface MangaSeeChapterRow {
  Chapter: string;
  ChapterName?: string | null;
  Page?: string;
}

interface MangaSeeCurChapter {
  Page: string;
}

const msFetch = ofetch.create({
  retry: 0,
  timeout: 25000,
  parseResponse: (text) => text,
  headers: {
    Accept: "text/html,application/xhtml+xml",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  },
});

function candidateUrls(url: string): string[] {
  const out: string[] = [];
  const add = (value?: string) => {
    if (value && !out.includes(value)) out.push(value);
  };
  if (typeof window !== "undefined") {
    add(proxiedMangaUrl(url, [resolveProxyUrl("/api/proxy")]));
  }
  for (const proxy of getProxyUrls()) {
    add(proxiedMangaUrl(url, [proxy]));
  }
  add(url);
  return out;
}

async function msGet(url: string): Promise<string> {
  let lastError: unknown;
  for (const target of candidateUrls(url)) {
    try {
      return await msFetch<string>(target);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("MangaSee request failed");
}

function parseScriptVariable<T>(script: string, variable: string): T | null {
  const idx = script.indexOf(variable);
  if (idx < 0) return null;
  const tail = script.slice(idx + variable.length);
  const end = tail.indexOf(";");
  if (end < 0) return null;
  try {
    return JSON.parse(tail.slice(0, end)) as T;
  } catch {
    return null;
  }
}

/** Decode MangaSee's packed chapter id (e.g. 100010 => 1, 101145 => 114.5). */
export function decodeMangaSeeChapterNumber(chapter: string): string {
  if (!chapter || chapter.length < 3) return "";
  const decimal = chapter.slice(-1);
  const body = chapter.slice(1, -1);
  const num = String(Number(body));
  if (decimal === "0") return num;
  return `${num}.${decimal}`;
}

/** Encode a display chapter number for MangaSee image paths. */
export function encodeMangaSeeChapterPath(chapter: string): string {
  if (!chapter.includes(".")) return chapter.padStart(4, "0");
  const [whole, frac] = chapter.split(".");
  return `${whole.padStart(4, "0")}.${frac}`;
}

function chapterReaderId(mangaSlug: string, chapter: string): string {
  return `${mangaSlug}-chapter-${chapter}`;
}

function proxiedPages(urls: string[]): string[] {
  const proxies = getProxyUrls();
  return urls.map((url) => proxiedMangaUrl(url, proxies) ?? url);
}

async function searchMangaSeeSlug(
  title: string,
  alternateTitles: string[] = [],
): Promise<string | null> {
  const queries = buildFallbackSearchQueries(title, alternateTitles);
  const html = await msGet(`${ORIGIN}/_search.php`);
  let rows: MangaSeeSearchRow[];
  try {
    rows = JSON.parse(html) as MangaSeeSearchRow[];
  } catch {
    return null;
  }
  const mapped = rows.map((row) => ({
    id: row.i,
    slug: row.i,
    title: row.s,
  }));
  for (const query of queries) {
    const match = pickBestSeriesHit(query, mapped);
    if (match && titlesCompatible(title, match.title, alternateTitles)) {
      return match.id;
    }
  }
  return null;
}

export async function resolveMangaSeeSlug(
  title: string,
  preferredSlug?: string | null,
  alternateTitles: string[] = [],
): Promise<string | null> {
  if (preferredSlug?.trim()) return preferredSlug.trim();
  return searchMangaSeeSlug(title, alternateTitles);
}

/** Resolve slug then pages — preferred over WeebCentral for stable chapter paths. */
export async function getMangaSeePagesForTitle(
  title: string,
  alternateTitles: string[],
  chapter: string,
): Promise<string[]> {
  const slug = await resolveMangaSeeSlug(title, null, alternateTitles);
  if (!slug) return [];
  return getMangaSeeChapterPages(slug, chapter);
}

export async function getMangaSeeChapterPages(
  mangaSlug: string,
  chapter: string,
): Promise<string[]> {
  const chapterNum = chapter.trim();
  if (!mangaSlug.trim() || !chapterNum) return [];

  const readerId = chapterReaderId(mangaSlug, chapterNum);
  const html = await msGet(
    `${ORIGIN}/read-online/${readerId}-page-1.html`,
  );

  const scriptMatch = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
  let curChapter: MangaSeeCurChapter | null = null;
  let imageHost: string | null = null;
  for (const block of scriptMatch ?? []) {
    const inner = block.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "");
    if (!curChapter) {
      curChapter = parseScriptVariable<MangaSeeCurChapter>(
        inner,
        "vm.CurChapter = ",
      );
    }
    if (!imageHost) {
      imageHost = parseScriptVariable<string>(inner, 'vm.CurPathName = ');
    }
  }

  const pageCount = Number(curChapter?.Page ?? 0);
  if (!pageCount || !imageHost) return [];

  const chapterPath = encodeMangaSeeChapterPath(chapterNum);
  const urls: string[] = [];
  for (let i = 0; i < pageCount; i += 1) {
    const page = String(i + 1).padStart(3, "0");
    urls.push(`https://${imageHost}/manga/${mangaSlug}/${chapterPath}-${page}.png`);
  }
  return proxiedPages(urls);
}

export async function listMangaSeeChapters(
  mangaSlug: string,
): Promise<{ chapter: string; pages: number }[]> {
  const html = await msGet(`${ORIGIN}/manga/${mangaSlug}`);
  const scriptMatch = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
  let rows: MangaSeeChapterRow[] | null = null;
  for (const block of scriptMatch ?? []) {
    const inner = block.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "");
    rows = parseScriptVariable<MangaSeeChapterRow[]>(inner, "vm.Chapters = ");
    if (rows?.length) break;
  }
  if (!rows?.length) return [];
  return rows.map((row) => ({
    chapter: decodeMangaSeeChapterNumber(row.Chapter),
    pages: Number(row.Page ?? 0),
  }));
}
