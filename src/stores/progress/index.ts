import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

import { PlayerMeta } from "@/stores/player/slices/source";
import { useWatchHistoryStore } from "@/stores/watchHistory";
import {
  ProgressModificationOptions,
  ProgressModificationResult,
  modifyProgressItems,
} from "@/utils/media/progressModifications";
import { hydrateHistoryItemGenres } from "@/pages/discover/lib/watchHistoryGenres";

import { progressIsCompleted } from "./utils";

export { getProgressPercentage, progressIsCompleted } from "./utils";

export interface ProgressItem {
  watched: number;
  duration: number;
}

export interface ProgressSeasonItem {
  title: string;
  number: number;
  id: string;
}

export interface ProgressEpisodeItem {
  title: string;
  number: number;
  id: string;
  seasonId: string;
  updatedAt: number;
  progress: ProgressItem;
}

export interface ProgressMediaItem {
  title: string;
  year?: number;
  poster?: string;
  type: "show" | "movie";
  progress?: ProgressItem;
  updatedAt: number;
  seasons: Record<string, ProgressSeasonItem>;
  episodes: Record<string, ProgressEpisodeItem>;
}

export interface ProgressUpdateItem {
  title?: string;
  year?: number;
  poster?: string;
  type?: "show" | "movie";
  progress?: ProgressItem;
  tmdbId: string;
  id: string;
  episodeId?: string;
  seasonId?: string;
  episodeNumber?: number;
  seasonNumber?: number;
  action: "upsert" | "delete";
}

export interface UpdateItemOptions {
  meta: PlayerMeta;
  progress: ProgressItem;
}

export interface ProgressStore {
  items: Record<string, ProgressMediaItem>;
  updateQueue: ProgressUpdateItem[];
  updateItem(ops: UpdateItemOptions): void;
  removeItem(id: string): void;
  replaceItems(items: Record<string, ProgressMediaItem>): void;
  modifyProgressItems(
    progressIds: string[],
    options: ProgressModificationOptions,
  ): ProgressModificationResult;
  clear(): void;
  clearUpdateQueue(): void;
  removeUpdateItem(id: string): void;
}

let updateId = 0;

export const useProgressStore = create(
  persist(
    immer<ProgressStore>((set) => ({
      items: {},
      updateQueue: [],
      removeItem(id) {
        set((s) => {
          updateId += 1;
          s.updateQueue.push({
            id: updateId.toString(),
            action: "delete",
            tmdbId: id,
          });

          delete s.items[id];
        });
      },
      replaceItems(items: Record<string, ProgressMediaItem>) {
        set((s) => {
          s.items = items;
        });
      },
      updateItem({ meta, progress }) {
        set((s) => {
          // add to updateQueue
          updateId += 1;
          s.updateQueue.push({
            tmdbId: meta.tmdbId,
            title: meta.title,
            year: meta.releaseYear,
            poster: meta.poster,
            type: meta.type,
            progress: { ...progress },
            id: updateId.toString(),
            episodeId: meta.episode?.tmdbId,
            seasonId: meta.season?.tmdbId,
            seasonNumber: meta.season?.number,
            episodeNumber: meta.episode?.number,
            action: "upsert",
          });

          // add to progress store
          if (!s.items[meta.tmdbId])
            s.items[meta.tmdbId] = {
              type: meta.type,
              episodes: {},
              seasons: {},
              updatedAt: 0,
              title: meta.title,
              year: meta.releaseYear,
              poster: meta.poster,
            };
          const item = s.items[meta.tmdbId];
          item.updatedAt = Date.now();

          if (meta.type === "movie") {
            if (!item.progress)
              item.progress = {
                duration: 0,
                watched: 0,
              };

            const wasCompleted = progressIsCompleted(
              item.progress.duration,
              item.progress.watched,
            );
            item.progress = { ...progress };

            // Update watch history only if becoming completed
            const isCompleted = progressIsCompleted(
              progress.duration,
              progress.watched,
            );
            if (isCompleted && !wasCompleted) {
              useWatchHistoryStore.getState().addItem(meta, progress, true);
              const historyKey = meta.tmdbId;
              void hydrateHistoryItemGenres(
                historyKey,
                meta.tmdbId,
                meta.type,
              );
            }
            return;
          }

          if (!meta.episode || !meta.season) return;

          if (!item.seasons[meta.season.tmdbId])
            item.seasons[meta.season.tmdbId] = {
              id: meta.season.tmdbId,
              number: meta.season.number,
              title: meta.season.title,
            };

          if (!item.episodes[meta.episode.tmdbId])
            item.episodes[meta.episode.tmdbId] = {
              id: meta.episode.tmdbId,
              number: meta.episode.number,
              title: meta.episode.title,
              seasonId: meta.season.tmdbId,
              updatedAt: Date.now(),
              progress: {
                duration: 0,
                watched: 0,
              },
            };

          const episodeItem = item.episodes[meta.episode.tmdbId];
          const wasCompleted = progressIsCompleted(
            episodeItem.progress.duration,
            episodeItem.progress.watched,
          );
          episodeItem.progress = { ...progress };

          // Update watch history only if becoming completed
          const isCompleted = progressIsCompleted(
            progress.duration,
            progress.watched,
          );
          if (isCompleted && !wasCompleted) {
            useWatchHistoryStore.getState().addItem(meta, progress, true);
            const historyKey = `${meta.tmdbId}-${meta.episode.tmdbId}`;
            void hydrateHistoryItemGenres(
              historyKey,
              meta.tmdbId,
              meta.type,
            );
          }
        });
      },
      clear() {
        set((s) => {
          s.items = {};
        });
      },
      clearUpdateQueue() {
        set((s) => {
          s.updateQueue = [];
        });
      },
      removeUpdateItem(id: string) {
        set((s) => {
          s.updateQueue = [...s.updateQueue.filter((v) => v.id !== id)];
        });
      },
      modifyProgressItems(
        progressIds: string[],
        options: ProgressModificationOptions,
      ): ProgressModificationResult {
        let result: ProgressModificationResult = {
          modifiedIds: [],
          hasChanges: false,
        };

        set((s) => {
          const { modifiedProgressItems, result: modificationResult } =
            modifyProgressItems(s.items, progressIds, options);
          s.items = modifiedProgressItems;
          result = modificationResult;

          // Add to update queue for modified progress items
          if (result.hasChanges) {
            result.modifiedIds.forEach((progressId) => {
              const progressItem = s.items[progressId];
              if (progressItem) {
                updateId += 1;
                s.updateQueue.push({
                  id: updateId.toString(),
                  action: "upsert",
                  tmdbId: progressId,
                  title: progressItem.title,
                  year: progressItem.year,
                  poster: progressItem.poster,
                  type: progressItem.type,
                  progress: progressItem.progress,
                });
              }
            });
          }
        });

        return result;
      },
    })),
    {
      name: "__MW::progress",
    },
  ),
);
