export interface MediaItem {
  id: string;
  title: string;
  year?: number;
  release_date?: Date;
  poster?: string;
  type: "show" | "movie" | "manga";
  /** TMDB adult / MangaDex erotica|pornographic — explicit adult, not R/TV-MA. */
  adult?: boolean;
  onHoverInfoEnter?: () => void;
  onHoverInfoLeave?: () => void;
}
