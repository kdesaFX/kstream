import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

import type { MangaTag } from "@/backend/manga/types";

export interface MangaProgressItem {
  title: string;
  poster?: string;
  year?: number;
  chapterId: string;
  chapterLabel: string;
  page: number;
  totalPages: number;
  updatedAt: number;
  readingDirection?: "ltr" | "rtl";
  tags?: MangaTag[];
}

interface MangaProgressStore {
  items: Record<string, MangaProgressItem>;
  updateProgress(ops: {
    mangaId: string;
    title: string;
    poster?: string;
    year?: number;
    chapterId: string;
    chapterLabel: string;
    page: number;
    totalPages: number;
    readingDirection?: "ltr" | "rtl";
    tags?: MangaTag[];
  }): void;
  removeItem(mangaId: string): void;
  clear(): void;
}

export const useMangaProgressStore = create<MangaProgressStore>()(
  persist(
    immer((set) => ({
      items: {},
      updateProgress(ops) {
        set((s) => {
          s.items[ops.mangaId] = {
            title: ops.title,
            poster: ops.poster,
            year: ops.year,
            chapterId: ops.chapterId,
            chapterLabel: ops.chapterLabel,
            page: ops.page,
            totalPages: ops.totalPages,
            updatedAt: Date.now(),
            readingDirection: ops.readingDirection,
            tags: ops.tags,
          };
        });
      },
      removeItem(mangaId) {
        set((s) => {
          delete s.items[mangaId];
        });
      },
      clear() {
        set((s) => {
          s.items = {};
        });
      },
    })),
    { name: "__MW::mangaProgress" },
  ),
);

export function shouldShowMangaProgress(item: MangaProgressItem): boolean {
  // Hide fully finished chapters that the reader has already closed past.
  if (item.totalPages > 0 && item.page >= item.totalPages - 1) {
    // Still show so they can resume the next chapter from the card —
    // the reader opens this chapter and they can tap next.
    return true;
  }
  return item.page >= 0;
}
