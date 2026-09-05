/**
 * Edge-safe MangaSee page URLs for /api/manga/pages.
 * Chapter number is baked into the CDN path (0041-001.png), so rapid Next
 * cannot resurface the wrong volume the way WeebCentral id→images can.
 */
import { DEFAULT_UA } from "./proxy-shared";

const ORIGIN = "https://mangasee123.com";

interface MangaSeeSearchRow {
  i: string;
  s: string;
  a?: string[];
}

interface MangaSeeCurChapter {
  Page: string;
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function titlesCompatible(wanted: string, candidate: string): boolean {
  const needle = normalizeTitle(wanted);
  const hay = normalizeTitle(candidate);
  if (!needle || !hay) return false;
  if (needle === hay || hay.includes(needle)) return true;
  if (needle.includes(hay) && hay.length >= Math.min(needle.length, 12)) {
    return true;
  }
  const tokens = needle.split(/\s+/).filter((t) => t.length >= 4);
  return tokens.length > 0 && tokens.every((t) => hay.includes(t));
}

export function encodeMangaSeeChapterPath(chapter: string): string {
  if (!chapter.includes(".")) return chapter.padStart(4, "0");
  const [whole, frac] = chapter.split(".");
  return `${whole.padStart(4, "0")}.${frac}`;
}

function proxyPageUrl(originUrl: string): string {
  return `/api/proxy?destination=${encodeURIComponent(originUrl)}`;
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

async function searchMangaSeeSlug(
  title: string,
  alternateTitles: string[],
): Promise<string | null> {
  const res = await fetch(`${ORIGIN}/_search.php`, {
    headers: {
      Accept: "application/json,text/plain,*/*",
      "User-Agent": DEFAULT_UA,
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return null;
  let rows: MangaSeeSearchRow[];
  try {
    rows = (await res.json()) as MangaSeeSearchRow[];
  } catch {
    return null;
  }

  const queries = [title, ...alternateTitles].map((q) => q.trim()).filter(Boolean);
  for (const query of queries) {
    const match = rows.find(
      (row) =>
        titlesCompatible(query, row.s) ||
        (row.a ?? []).some((alt) => titlesCompatible(query, alt)),
    );
    if (match?.i) return match.i;
  }
  return null;
}

export async function fetchMangaSeePagesForTitle(
  title: string,
  alternateTitles: string[],
  chapter: string,
): Promise<string[]> {
  const chapterNum = chapter.trim();
  if (!title.trim() || !chapterNum) return [];

  const slug = await searchMangaSeeSlug(title, alternateTitles);
  if (!slug) return [];

  const readerId = `${slug}-chapter-${chapterNum}`;
  const res = await fetch(`${ORIGIN}/read-online/${readerId}-page-1.html`, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": DEFAULT_UA,
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return [];
  const html = await res.text();

  const scriptMatch = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
  let curChapter: MangaSeeCurChapter | null = null;
  let imageHost: string | null = null;
  for (const block of scriptMatch ?? []) {
    const inner = block
      .replace(/^<script[^>]*>/i, "")
      .replace(/<\/script>$/i, "");
    if (!curChapter) {
      curChapter = parseScriptVariable<MangaSeeCurChapter>(
        inner,
        "vm.CurChapter = ",
      );
    }
    if (!imageHost) {
      imageHost = parseScriptVariable<string>(inner, "vm.CurPathName = ");
    }
  }

  const pageCount = Number(curChapter?.Page ?? 0);
  if (!pageCount || !imageHost) return [];

  const chapterPath = encodeMangaSeeChapterPath(chapterNum);
  const urls: string[] = [];
  for (let i = 0; i < pageCount; i += 1) {
    const page = String(i + 1).padStart(3, "0");
    urls.push(
      proxyPageUrl(
        `https://${imageHost}/manga/${slug}/${chapterPath}-${page}.png`,
      ),
    );
  }
  return urls;
}
