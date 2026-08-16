export interface MediaItem {
  id: string;
  title: string;
  year?: number;
  release_date?: Date;
  poster?: string;
  type: "show" | "movie";
  /** TMDB adult flag — explicit adult content, not R/TV-MA. */
  adult?: boolean;
  onHoverInfoEnter?: () => void;
  onHoverInfoLeave?: () => void;
}
