export type MangaContentRating =
  | "safe"
  | "suggestive"
  | "erotica"
  | "pornographic";

export type MangaStatus =
  | "ongoing"
  | "completed"
  | "hiatus"
  | "cancelled"
  | "unknown";

export type MangaReadingDirection = "ltr" | "rtl";

/** Where a chapter's pages actually live. MangaDex is the default. */
export type MangaSource = "mangadex" | "weebcentral";

export interface MangaTag {
  id: string;
  name: string;
}

export interface MangaListItem {
  id: string;
  title: string;
  description?: string;
  poster?: string;
  year?: number;
  status: MangaStatus;
  contentRating: MangaContentRating;
  tags: MangaTag[];
  /** True for erotica / pornographic — gates like TMDB adult. */
  adult: boolean;
  rating?: number;
  follows?: number;
  lastChapter?: string;
  originalLanguage?: string;
  readingDirection: MangaReadingDirection;
  /** Romaji / alt names — used to find WeebCentral when MangaDex is licensed-only. */
  alternateTitles?: string[];
}

export interface MangaChapter {
  id: string;
  volume: string | null;
  chapter: string | null;
  title: string | null;
  pages: number;
  translatedLanguage: string;
  publishAt?: string;
  /** Absent means MangaDex, which is what every chapter was before WeebCentral. */
  source?: MangaSource;
}

export interface MangaChapterGroup {
  volume: string;
  chapters: MangaChapter[];
}

export interface MangaDetails extends MangaListItem {
  authors: string[];
  artists: string[];
  chapterGroups: MangaChapterGroup[];
  chapters: MangaChapter[];
}

export interface MangaAtHome {
  baseUrl: string;
  hash: string;
  data: string[];
  dataSaver: string[];
}

export function isMatureMangaRating(rating: MangaContentRating): boolean {
  return rating === "erotica" || rating === "pornographic";
}

/**
 * MangaDex hands back a bare enum value ("ongoing"), which reads as a typo next
 * to real prose. Returns the translation key to show, or null when there is
 * nothing worth saying.
 */
export function mangaStatusKey(status: MangaStatus): string | null {
  if (status === "unknown") return null;
  return `manga.status.${status}`;
}
