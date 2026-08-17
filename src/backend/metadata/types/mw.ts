export enum MWMediaType {
  MOVIE = "movie",
  SERIES = "series",
  ANIME = "anime",
}

export type MWSeasonMeta = {
  id: string;
  number: number;
  title: string;
};

export type MWSeasonWithEpisodeMeta = {
  id: string;
  number: number;
  title: string;
  episodes: {
    id: string;
    number: number;
    title: string;
    air_date: string;
    still_path: string | null;
    overview: string;
    /** Minutes, when TMDB has it. */
    runtime?: number | null;
  }[];
};

type MWMediaMetaBase = {
  title: string;
  originalTitle?: string;
  id: string;
  year?: string;
  /** ISO date YYYY-MM-DD when known (for Discord presence, etc.). */
  releaseDate?: string;
  poster?: string;
  overview?: string;
  /** Movie length in minutes. */
  runtime?: number | null;
  /** Typical episode length in minutes, for shows. */
  episodeRuntime?: number | null;
};

type MWMediaMetaSpecific =
  | {
      type: MWMediaType.MOVIE | MWMediaType.ANIME;
      seasons: undefined;
    }
  | {
      type: MWMediaType.SERIES;
      seasons: MWSeasonMeta[];
      seasonData: MWSeasonWithEpisodeMeta;
    };

export type MWMediaMeta = MWMediaMetaBase & MWMediaMetaSpecific;

export interface MWQuery {
  searchQuery: string;
}

export interface DetailedMeta {
  meta: MWMediaMeta;
  imdbId?: string;
  tmdbId?: string;
}
