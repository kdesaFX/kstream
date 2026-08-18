import type { MangaProgressItem } from "@/stores/mangaProgress";

/** Minimum pages read before a title counts as real signal. */
const MIN_READ_PAGES = 5;
/** Fraction of the current chapter read — mirrors movie/TV recommendation bar. */
const MIN_READ_FRACTION = 0.15;

/**
 * True once the reader has gone far enough into a chapter for it to seed
 * "Because You Read" — same idea as progressHasMeaningfulWatch for video.
 */
export function mangaProgressHasMeaningfulRead(
  item: MangaProgressItem,
): boolean {
  if (item.totalPages <= 0) return item.page >= MIN_READ_PAGES;
  if (item.page >= item.totalPages - 1) return true;
  if (item.page / item.totalPages >= MIN_READ_FRACTION) return true;
  return item.page >= MIN_READ_PAGES;
}
