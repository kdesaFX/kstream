export interface MediaItem {
  id: string;
  title: string;
  year?: number;
  release_date?: Date;
  poster?: string;
  type: "show" | "movie" | "manga";
  /** TMDB vote_average (0–10). */
  voteAverage?: number;
  /** US content rating from TMDB (PG-13, R, TV-MA, etc.). */
  contentRating?: string;
  /** TMDB adult / MangaDex erotica|pornographic — explicit adult, not R/TV-MA. */
  adult?: boolean;
  onHoverInfoEnter?: () => void;
  onHoverInfoLeave?: () => void;
}
