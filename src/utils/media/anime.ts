/** Provider source ids that only make sense for anime titles. */
export const ANIME_SOURCE_IDS = new Set(["tqq", "myanime"]);

export const TMDB_ANIMATION_GENRE_ID = 16;

export type AnimeDetectionInput = {
  genreIds?: number[] | null;
  originalLanguage?: string | null;
  originCountry?: string[] | null;
};

/** True when we have TMDB genre data to decide anime vs not. */
export function hasAnimeDetectionData(
  meta: AnimeDetectionInput | null | undefined,
): boolean {
  return Array.isArray(meta?.genreIds);
}

/**
 * True when TMDB marks Animation and the title is Japanese-origin.
 * Avoids treating Western cartoons (Toy Story, etc.) as anime.
 */
export function isAnimeTitle(meta: AnimeDetectionInput | null | undefined): boolean {
  if (!hasAnimeDetectionData(meta)) return false;
  const genreIds = meta?.genreIds ?? [];
  if (!genreIds.includes(TMDB_ANIMATION_GENRE_ID)) return false;

  const lang = (meta?.originalLanguage ?? "").toLowerCase();
  if (lang === "ja") return true;

  const countries = meta?.originCountry ?? [];
  return countries.some((c) => c.toUpperCase() === "JP");
}

export function isAnimeSourceId(sourceId: string): boolean {
  return ANIME_SOURCE_IDS.has(sourceId);
}
