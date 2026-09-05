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

export function pagesBelongToTitle(
  pages: string[],
  title?: string,
  alternateTitles: string[] = [],
): boolean {
  if (!title || pages.length === 0) return true;
  const resolved = pages.map(unwrapPageUrl);
  const slug = resolved.map(seriesSlugFromPageUrl).find(Boolean);
  if (slug) {
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
