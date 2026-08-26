import slugify from "slugify";

const MANGADEX = "mangadex";
const WEEBCENTRAL = "weebcentral";

/** WeebCentral series and chapter ids are ULIDs (26 Crockford characters). */
export function isWeebCentralId(id: string): boolean {
  return /^[0-9A-HJKMNP-TV-Z]{26}$/i.test(id);
}

export function isMangaDexId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    id,
  );
}

/** Chapter ids we can page-fetch before merged manga details arrive. */
export function isDirectLoadableChapterId(id: string): boolean {
  return isMangaDexId(id) || isWeebCentralId(id) || id.startsWith("comick-");
}

export function slugToTitleHint(slug?: string): string | undefined {
  if (!slug?.trim()) return undefined;
  const title = slug.replace(/-/g, " ").trim();
  return title || undefined;
}

/** Encode a manga id + title into a URL segment. */
export function mangaIdToUrlId(mangaId: string, title: string): string {
  const prefix = isWeebCentralId(mangaId) ? WEEBCENTRAL : MANGADEX;
  return [
    prefix,
    mangaId,
    slugify(title, { lower: true, strict: true }) || "manga",
  ].join("-");
}

/** Decode `/manga/:media` param. */
export function decodeMangaId(
  paramId: string,
): { id: string; slug?: string } | null {
  const decoded = decodeURIComponent(paramId);

  if (decoded.startsWith(`${WEEBCENTRAL}-`)) {
    const rest = decoded.slice(WEEBCENTRAL.length + 1);
    const match = rest.match(/^([0-9A-HJKMNP-TV-Z]{26})(?:-(.*))?$/i);
    if (!match) return null;
    return { id: match[1], slug: match[2] };
  }

  if (!decoded.startsWith(`${MANGADEX}-`)) return null;
  const rest = decoded.slice(MANGADEX.length + 1);
  // UUID is 36 chars with dashes
  const uuidMatch = rest.match(
    /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:-(.*))?$/i,
  );
  if (!uuidMatch) return null;
  return { id: uuidMatch[1], slug: uuidMatch[2] };
}

export function mangaMediaLink(mangaId: string, title: string): string {
  return `/manga/${encodeURIComponent(mangaIdToUrlId(mangaId, title))}`;
}

export function mangaChapterLink(
  mangaId: string,
  title: string,
  chapterId: string,
): string {
  return `${mangaMediaLink(mangaId, title)}/${encodeURIComponent(chapterId)}`;
}
