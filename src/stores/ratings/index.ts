import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

/**
 * Rating intensity levels: "loved"/"hated" weigh roughly twice as much
 * as "liked"/"disliked" in the recommendation algorithm.
 */
export type MediaRating = "loved" | "liked" | "disliked" | "hated";

export interface RatedMediaItem {
  rating: MediaRating;
  type: "movie" | "show";
  title: string;
  year?: number;
  poster?: string;
  /**
   * TMDB genre ids snapshotted at rating time, so the recommendation
   * algorithm can build a taste profile without extra API calls.
   */
  genreIds?: number[];
  ratedAt: number;
}

export interface RateMediaMeta {
  tmdbId: string;
  title: string;
  type: "movie" | "show";
  year?: number;
  poster?: string;
  genreIds?: number[];
}

export interface RatingsStore {
  ratings: Record<string, RatedMediaItem>;
  /** Sets the rating; rating the same value again removes it (toggle). */
  toggleRating(meta: RateMediaMeta, rating: MediaRating): void;
  removeRating(tmdbId: string): void;
  getRating(tmdbId: string): MediaRating | null;
  clear(): void;
}

export const useRatingsStore = create(
  persist(
    immer<RatingsStore>((set, get) => ({
      ratings: {},
      toggleRating(meta, rating) {
        set((s) => {
          const existing = s.ratings[meta.tmdbId];
          if (existing?.rating === rating) {
            delete s.ratings[meta.tmdbId];
            return;
          }
          s.ratings[meta.tmdbId] = {
            rating,
            type: meta.type,
            title: meta.title,
            year: meta.year,
            poster: meta.poster,
            genreIds: meta.genreIds,
            ratedAt: Date.now(),
          };
        });
      },
      removeRating(tmdbId) {
        set((s) => {
          delete s.ratings[tmdbId];
        });
      },
      getRating(tmdbId) {
        return get().ratings[tmdbId]?.rating ?? null;
      },
      clear() {
        set((s) => {
          s.ratings = {};
        });
      },
    })),
    {
      name: "__MW::ratings",
    },
  ),
);
