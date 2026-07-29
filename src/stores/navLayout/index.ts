import { create } from "zustand";

interface NavLayoutStore {
  leftWidth: number;
  rightWidth: number;
  setLeftWidth(width: number): void;
  setRightWidth(width: number): void;
}

// Tracks the rendered width of the nav bar's left (logo/icons) and right
// (layout/avatar) clusters, so other elements sharing the top of the page
// (e.g. the hero search bar) can size themselves to fit the gap between
// them instead of overlapping.
export const useNavLayoutStore = create<NavLayoutStore>((set) => ({
  leftWidth: 0,
  rightWidth: 0,
  setLeftWidth(width) {
    set({ leftWidth: width });
  },
  setRightWidth(width) {
    set({ rightWidth: width });
  },
}));
