/**
 * Edge-safe manga page fetchers for /api/manga/pages (no browser/proxy chain).
 */
import { DEFAULT_UA } from "./proxy-shared";

const COMICK_API = "https://api.comick.dev";
const COMICK_CDN = "https://meo.comick.pictures";
const WC_ORIGIN = "https://weebcentral.com";
const MD_API = "https://api.mangadex.org";

const COMICK_HEADERS: Record<string, string> = {
  accept: "application/json",
  "User-Agent": "Tachiyomi",
  "x-origin": "https://comick.io",
};

export function proxyPageUrl(originUrl: string): string {
  return `/api/proxy?destination=${encodeURIComponent(originUrl)}`;
}

export function isComickChapterId(id: string): boolean {
  return id.startsWith("comick-");
}

export function comickChapterHid(id: string): string | null {
  if (!isComickChapterId(id)) return null;
  return id.slice("comick-".length) || null;
}

export function isWeebCentralChapterId(id: string): boolean {
  return /^[0-9A-HJKMNP-TV-Z]{26}$/i.test(id);
}

export function isMangaDexChapterId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    id,
  );
}

function parseWeebCentralImages(html: string): string[] {
  const urls: string[] = [];
  for (const match of html.matchAll(/\ssrc="(https:\/\/[^"]+)"/gi)) {
    const url = match[1];
    if (/broken_image|\/static\//i.test(url)) continue;
    if (!/\.(png|jpe?g|webp|gif)(\?|$)/i.test(url)) continue;
    urls.push(url);
  }
  return [...new Set(urls)];
}

interface ComickChapterDetail {
  md_images?: { b2key?: string | null }[];
  dupGroupChapters?: { hid?: string }[];
}

function pagesFromComickDetail(detail: ComickChapterDetail | undefined): string[] {
  const images = detail?.md_images ?? [];
  return images
    .map((img) => img.b2key)
    .filter((key): key is string => Boolean(key))
    .map((key) => proxyPageUrl(`${COMICK_CDN}/${key}`));
}

async function fetchComickDetail(hid: string): Promise<ComickChapterDetail | undefined> {
  const res = await fetch(`${COMICK_API}/chapter/${hid}?tachiyomi=true`, {
    headers: COMICK_HEADERS,
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return undefined;
  const data = (await res.json()) as { chapter?: ComickChapterDetail };
  return data.chapter;
}

export async function fetchComickChapterPages(chapterId: string): Promise<string[]> {
  const hid = comickChapterHid(chapterId);
  if (!hid) return [];

  const detail = await fetchComickDetail(hid);
  const direct = pagesFromComickDetail(detail);
  if (direct.length > 0) return direct;

  const altHids = (detail?.dupGroupChapters ?? [])
    .map((row) => row.hid)
    .filter((alt): alt is string => Boolean(alt && alt !== hid));

  const altResults = await Promise.all(
    altHids.map(async (altHid) => pagesFromComickDetail(await fetchComickDetail(altHid))),
  );
  for (const pages of altResults) {
    if (pages.length > 0) return pages;
  }
  return [];
}

export async function fetchWeebCentralChapterPages(
  chapterId: string,
): Promise<string[]> {
  const res = await fetch(
    `${WC_ORIGIN}/chapters/${chapterId}/images?is_prev=False&reading_style=long_strip`,
    {
      headers: {
        Accept: "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "HX-Request": "true",
        "User-Agent": DEFAULT_UA,
      },
      signal: AbortSignal.timeout(12000),
    },
  );
  if (!res.ok) return [];
  const html = await res.text();
  if (!/weebcentral\.com|chapter-images|planeptune/i.test(html)) return [];
  return parseWeebCentralImages(html);
}

export async function fetchMangaDexChapterPages(
  chapterId: string,
): Promise<string[]> {
  const res = await fetch(
    `${MD_API}/at-home/server/${chapterId}?forcePort443=true`,
    {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    },
  );
  if (!res.ok) return [];
  const data = (await res.json()) as {
    baseUrl?: string;
    chapter?: { hash?: string; data?: string[]; dataSaver?: string[] };
  };
  const baseUrl = data.baseUrl;
  const hash = data.chapter?.hash;
  const files = data.chapter?.data?.length
    ? data.chapter.data
    : data.chapter?.dataSaver ?? [];
  if (!baseUrl || !hash || files.length === 0) return [];
  const folder = data.chapter?.data?.length ? "data" : "data-saver";
  return files.map((file) =>
    proxyPageUrl(`${baseUrl}/${folder}/${hash}/${file}`),
  );
}

export async function fetchChapterPagesById(chapterId: string): Promise<string[]> {
  if (isComickChapterId(chapterId)) {
    return fetchComickChapterPages(chapterId);
  }
  if (isWeebCentralChapterId(chapterId)) {
    return fetchWeebCentralChapterPages(chapterId);
  }
  if (isMangaDexChapterId(chapterId)) {
    return fetchMangaDexChapterPages(chapterId);
  }
  return [];
}
