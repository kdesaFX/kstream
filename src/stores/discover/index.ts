import { create } from "zustand";
import { persist } from "zustand/middleware";

type Category = "foryou" | "movies" | "tvshows" | "editorpicks";

interface DiscoverView {
  url: string;
  scrollPosition: number;
}

interface DiscoverState {
  selectedCategory: Category;
  // Tracks whether the user has ever explicitly picked a tab, so an
  // automatic default (e.g. "foryou" once a taste profile exists) can keep
  // adapting for users who haven't stated a preference, without ever
  // overriding one they've deliberately chosen.
  hasManuallySelected: boolean;
  lastView: DiscoverView | null;
  setSelectedCategory: (category: Category) => void;
  setLastView: (view: DiscoverView) => void;
  clearLastView: () => void;
}

export const useDiscoverStore = create<DiscoverState>()(
  persist(
    (set) => ({
      selectedCategory: "movies",
      hasManuallySelected: false,
      lastView: null,
      setSelectedCategory: (category) =>
        set({ selectedCategory: category, hasManuallySelected: true }),
      setLastView: (view) => set({ lastView: view }),
      clearLastView: () => set({ lastView: null }),
    }),
    {
      name: "__MW::discover",
    },
  ),
);
