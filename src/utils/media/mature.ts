import { usePreferencesStore } from "@/stores/preferences";

/** TMDB's `adult` flag (explicit adult), not R/TV-MA. */
export function isMatureMedia(
  item: { adult?: boolean } | null | undefined,
): boolean {
  return item?.adult === true;
}

export function shouldAllowMatureTitles(): boolean {
  return usePreferencesStore.getState().enableMatureTitles;
}

/** Drop adult titles from browse/discover lists when the preference is off. */
export function filterOutMatureMedia<T extends { adult?: boolean }>(
  items: T[],
): T[] {
  if (shouldAllowMatureTitles()) return items;
  return items.filter((item) => !isMatureMedia(item));
}

/** Value for TMDB `include_adult` on non-search browse/discover calls. */
export function tmdbIncludeAdult(): boolean {
  return shouldAllowMatureTitles();
}
