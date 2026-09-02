import type { AnimeDetectionInput } from "@/utils/media/anime";

export const CASTLETV_SOURCE_ID = "castletv";

const INDIAN_LANGUAGE_CODES = new Set(["hi", "ta", "te", "bn", "ml", "kn", "mr", "gu", "pa"]);

/** TMDB Indian-origin titles where CastleTV (IndiaA) is the specialist. */
export function isIndianTitle(
  meta: AnimeDetectionInput | null | undefined,
): boolean {
  if (!meta) return false;

  const countries = meta.originCountry ?? [];
  if (countries.some((c) => c.toUpperCase() === "IN")) return true;

  const lang = (meta.originalLanguage ?? "").toLowerCase();
  return INDIAN_LANGUAGE_CODES.has(lang);
}

export function prioritizeIndianSources(
  sourceIds: string[],
  meta: AnimeDetectionInput | null | undefined,
): string[] {
  if (!isIndianTitle(meta) || !sourceIds.includes(CASTLETV_SOURCE_ID)) {
    return sourceIds;
  }
  return [
    CASTLETV_SOURCE_ID,
    ...sourceIds.filter((id) => id !== CASTLETV_SOURCE_ID),
  ];
}
