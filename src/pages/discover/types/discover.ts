export type DiscoverContentType =
  | "popular"
  | "topRated"
  | "onTheAir"
  | "nowPlaying"
  | "latest"
  | "latest4k"
  | "latesttv"
  | "top10"
  | "genre"
  | "provider"
  | "recommendations"
  | "popularThisWeek"
  | "randomPopular";

export type MediaType = "movie" | "tv";

export interface UseDiscoverMediaProps {
  contentType: DiscoverContentType;
  mediaType: MediaType;
  id?: string;
  fallbackType?: DiscoverContentType;
  page?: number;
  genreName?: string;
  providerName?: string;
  mediaTitle?: string;
  isCarouselView?: boolean;
  enabled?: boolean;
  /** Global genre chip filter (All = undefined). Applied via with_genres or genre_ids. */
  genreId?: string | null;
}

export interface DiscoverMedia {
  id: number;
  title: string;
  name?: string;
  poster_path: string;
  backdrop_path: string;
  release_date?: string;
  first_air_date?: string;
  overview: string;
  vote_average: number;
  vote_count: number;
  type?: "movie" | "show";
  genre_ids?: number[];
  /** Raw recommendation score from fetchPersonalRecommendations, higher = stronger match. Only present on personalized results. */
  matchScore?: number;
}

export interface UseDiscoverMediaReturn {
  media: DiscoverMedia[];
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  refetch: () => Promise<void>;
  sectionTitle: string;
  actualContentType: DiscoverContentType;
}

export interface Provider {
  name: string;
  id: string;
}

export interface Genre {
  id: number;
  name: string;
}

// Static provider lists
export const MOVIE_PROVIDERS: Provider[] = [
  { name: "Netflix", id: "8" },
  { name: "Apple TV+", id: "2" },
  { name: "Amazon Prime Video", id: "10" },
  { name: "Hulu", id: "15" },
  { name: "Disney Plus", id: "337" },
  { name: "Max", id: "1899" },
  { name: "Paramount Plus", id: "531" },
  { name: "Shudder", id: "99" },
  { name: "Crunchyroll", id: "283" },
  { name: "fuboTV", id: "257" },
  { name: "AMC+", id: "526" },
  { name: "Starz", id: "43" },
  { name: "Lifetime", id: "157" },
  { name: "National Geographic", id: "1964" },
];

export const TV_PROVIDERS: Provider[] = [
  { name: "Netflix", id: "8" },
  { name: "Apple TV+", id: "350" },
  { name: "Amazon Prime Video", id: "10" },
  { name: "Paramount Plus", id: "531" },
  { name: "Hulu", id: "15" },
  { name: "Max", id: "1899" },
  { name: "Adult Swim", id: "318" },
  { name: "Disney Plus", id: "337" },
  { name: "Crunchyroll", id: "283" },
  { name: "fuboTV", id: "257" },
  { name: "Shudder", id: "99" },
  { name: "Discovery +", id: "520" },
  { name: "National Geographic", id: "1964" },
  { name: "Fox", id: "328" },
];
