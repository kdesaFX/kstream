import { create } from "zustand";
import { persist } from "zustand/middleware";

type Category = "movies" | "tvshows" | "manga";

export type RecommendationSeedMedia = "movie" | "tv" | "manga";

export interface RecommendationSeed {
  id: string;
  title: string;
  /** User picked via Change — keep across remounts until they watch something newer. */
  manual: boolean;
}

interface DiscoverView {
  url: string;
  scrollPosition: number;
}

interface DiscoverState {
  selectedCategory: Category;
  // Tracks whether the user has ever explicitly picked a tab, so an
  // automatic default can keep adapting for users who haven't stated a
  // preference, without ever overriding one they've deliberately chosen.
  hasManuallySelected: boolean;
  /** null = All genres (unfiltered). Cleared when switching tabs. */
  selectedGenreId: string | null;
  /** Sticky Because You Watched / Read seeds so player→home doesn't re-roll niche. */
  recommendationSeeds: Partial<
    Record<RecommendationSeedMedia, RecommendationSeed>
  >;
  lastView: DiscoverView | null;
  setSelectedCategory: (category: Category) => void;
  setSelectedGenreId: (id: string | null) => void;
  setRecommendationSeed: (
    media: RecommendationSeedMedia,
    seed: RecommendationSeed,
  ) => void;
  setLastView: (view: DiscoverView) => void;
  clearLastView: () => void;
}

function normalizeCategory(category: unknown): Category {
  if (category === "movies" || category === "tvshows" || category === "manga") {
    return category;
  }
  // Drop legacy "foryou" / "editorpicks" (and anything else) onto movies
  return "movies";
}

export const useDiscoverStore = create<DiscoverState>()(
  persist(
    (set) => ({
      selectedCategory: "movies",
      hasManuallySelected: false,
      selectedGenreId: null,
      recommendationSeeds: {},
      lastView: null,
      setSelectedCategory: (category) =>
        set({
          selectedCategory: normalizeCategory(category),
          hasManuallySelected: true,
          selectedGenreId: null,
        }),
      setSelectedGenreId: (id) => set({ selectedGenreId: id }),
      setRecommendationSeed: (media, seed) =>
        set((state) => {
          const current = state.recommendationSeeds[media];
          if (
            current?.id === seed.id &&
            current.title === seed.title &&
            current.manual === seed.manual
          ) {
            return state;
          }
          return {
            recommendationSeeds: {
              ...state.recommendationSeeds,
              [media]: seed,
            },
          };
        }),
      setLastView: (view) => set({ lastView: view }),
      clearLastView: () => set({ lastView: null }),
    }),
    {
      name: "__MW::discover",
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<DiscoverState>;
        return {
          ...current,
          ...p,
          selectedCategory: normalizeCategory(p.selectedCategory),
          // Genre filter is session-local — don't restore a stale chip.
          selectedGenreId: null,
          recommendationSeeds: p.recommendationSeeds ?? {},
        };
      },
    },
  ),
);
