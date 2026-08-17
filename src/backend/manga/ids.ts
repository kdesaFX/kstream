import slugify from "slugify";

const PREFIX = "mangadex";

/** Encode a MangaDex manga UUID + title into a URL segment. */
export function mangaIdToUrlId(mangaId: string, title: string): string {
  return [
    PREFIX,
    mangaId,
    slugify(title, { lower: true, strict: true }) || "manga",
  ].join("-");
}

/** Decode `/manga/:media` param. UUID may contain no dashes split issues —
 * MangaDex UUIDs are `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`. */
export function decodeMangaId(
  paramId: string,
): { id: string; slug?: string } | null {
  const decoded = decodeURIComponent(paramId);
  if (!decoded.startsWith(`${PREFIX}-`)) return null;
  const rest = decoded.slice(PREFIX.length + 1);
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
