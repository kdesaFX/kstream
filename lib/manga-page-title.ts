/**
 * Shared page-URL ↔ title checks for client and /api/manga/pages.
 * Rejects foreign WeebCentral/CDN folders (e.g. Horimiya under JJK).
 */

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

const GENERIC_TOKENS = new Set([
  "leveling",
  "warrior",
  "legend",
  "chronicles",
  "adventures",
  "story",
  "tales",
  "world",
  "life",
  "love",
  "girl",
  "boy",
  "man",
  "hero",
  "magic",
  "school",
  "high",
  "chapter",
  "volume",
]);

function normalizeMangaTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function significantTokens(title: string): string[] {
  return title
    .replace(/[!?,.'’:]/g, " ")
    .split(/\s+/)
    .map((word) => word.toLowerCase())
    .filter((word) => word.length >= 4 && !SEARCH_STOP.has(word));
}

function isGenericSearchToken(token: string): boolean {
  return GENERIC_TOKENS.has(token.toLowerCase());
}

function titleSatisfiesQuery(query: string, candidate: string): boolean {
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

function titlesCompatible(
  wanted: string,
  candidate: string,
  alternateTitles: string[] = [],
): boolean {
  if (/doujin|fan.?colored|anthology|oneshot|spin.?off/i.test(candidate)) {
    return false;
  }
  if (titleSatisfiesQuery(wanted, candidate)) return true;
  return alternateTitles.some((alt) => titleSatisfiesQuery(alt, candidate));
}

function slugMatchesTitle(
  slug: string,
  title: string,
  alternateTitles: string[],
): boolean {
  if (titlesCompatible(title, slug, alternateTitles)) return true;
  const tokens = significantTokens(title).filter(
    (token) => token.length >= 6 && !isGenericSearchToken(token),
  );
  if (tokens.length === 1) {
    const hay = normalizeMangaTitle(slug);
    if (hay.includes(tokens[0])) return true;
  }
  return false;
}

/** Unwrap `/api/proxy?destination=` (and nested encodings) so slug checks see the CDN path. */
export function unwrapPageUrl(url: string): string {
  let current = url;
  for (let i = 0; i < 3; i += 1) {
    try {
      const dest = new URL(current, "https://local.invalid").searchParams.get(
        "destination",
      );
      if (!dest) break;
      current = dest;
    } catch {
      break;
    }
  }
  try {
    return decodeURIComponent(current);
  } catch {
    return current;
  }
}

export function seriesSlugFromPageUrl(url: string): string | null {
  const m = /\/manga\/([^/?#]+)\//i.exec(unwrapPageUrl(url));
  if (!m?.[1]) return null;
  return decodeURIComponent(m[1]).replace(/-/g, " ");
}

/** Chapter index embedded in WC/CDN filenames, e.g. `0013-001.png` → 13. */
export function chapterPrefixFromPageUrl(url: string): number | null {
  const path = unwrapPageUrl(url);
  const m =
    /\/(\d{2,4})-\d{2,4}\.(?:png|jpe?g|webp|gif)(?:\?|$)/i.exec(path) ??
    /(?:^|\/)(\d{2,4})-\d{2,4}\.(?:png|jpe?g|webp|gif)(?:\?|$)/i.exec(path);
  if (!m?.[1]) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * When CDN filenames carry `NNNN-PPP` chapter prefixes, every prefixed page must
 * match the requested chapter (stops ch13 showing `0030-*.png` volume art).
 * MangaDex hash URLs without prefixes always pass.
 */
export function pagesMatchChapter(
  pages: string[],
  chapter?: string | null,
): boolean {
  if (!chapter?.trim() || pages.length === 0) return true;
  const wanted = parseFloat(chapter.trim());
  if (!Number.isFinite(wanted)) return true;

  const prefixes = pages
    .map(chapterPrefixFromPageUrl)
    .filter((n): n is number => n != null);
  if (prefixes.length === 0) {
    // MangaSee/WC-style `/manga/slug/file` pages should carry NNNN-PPP names.
    // Bare covers / odd filenames under that path are a common wrong-chapter
    // poison vector when WeebCentral serves volume art for a chapter id.
    const mangaFolderPages = pages.filter((url) =>
      /\/manga\/[^/?#]+\//i.test(unwrapPageUrl(url)),
    );
    if (mangaFolderPages.length > 0) return false;
    return true;
  }

  const integerWanted = Number.isInteger(wanted)
    ? wanted
    : Math.floor(wanted);
  // Whole chapters: require exact prefix (13 ≠ 30). Decimals (13.5): allow
  // floor match when the host only encodes the integer part.
  if (Number.isInteger(wanted)) {
    return prefixes.every((n) => n === wanted);
  }
  return prefixes.every((n) => n === wanted || n === integerWanted);
}

export function pagesBelongToTitle(
  pages: string[],
  title?: string,
  alternateTitles: string[] = [],
): boolean {
  if (!title || pages.length === 0) return true;
  const resolved = pages.map(unwrapPageUrl);
  const slugs = [
    ...new Set(
      resolved
        .map((url) => seriesSlugFromPageUrl(url))
        .filter((slug): slug is string => Boolean(slug)),
    ),
  ];
  // Every distinct series folder must belong to the title — mixed JJK +
  // D.Gray-man lists used to pass because only the first slug was checked.
  if (slugs.length > 0) {
    return slugs.every((slug) =>
      slugMatchesTitle(slug, title, alternateTitles),
    );
  }

  const urlBlob = normalizeMangaTitle(resolved.slice(0, 5).join(" "));
  const foreign = /\/manga\/([a-z0-9][a-z0-9-]{2,})\//i.exec(resolved[0] ?? "");
  if (foreign?.[1]) {
    return titlesCompatible(
      title,
      foreign[1].replace(/-/g, " "),
      alternateTitles,
    );
  }
  const tokens = significantTokens(title).filter(
    (token) => token.length >= 6 && !isGenericSearchToken(token),
  );
  // After unwrap/normalize, slashes become spaces — detect series folder by token.
  if (tokens.length >= 1 && /\bmanga\b/i.test(urlBlob)) {
    return tokens.some((token) => urlBlob.includes(token));
  }
  return true;
}

/** Title + optional chapter-number gate used before paint / cache write. */
export function pagesValidForManga(
  pages: string[],
  title?: string,
  alternateTitles: string[] = [],
  chapter?: string | null,
): boolean {
  if (!pagesBelongToTitle(pages, title, alternateTitles)) return false;
  return pagesMatchChapter(pages, chapter);
}
