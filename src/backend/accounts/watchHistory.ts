import {
  deleteWatchHistory as sbDeleteWatchHistory,
  upsertWatchHistory,
} from "@/backend/supabase/data";
import { AccountWithToken } from "@/stores/auth";
import {
  WatchHistoryItem,
  WatchHistoryUpdateItem,
} from "@/stores/watchHistory";

export interface WatchHistoryInput {
  meta?: {
    title: string;
    year: number;
    poster?: string;
    type: string;
  };
  tmdbId: string;
  watched: number;
  duration: number;
  watchedAt: string;
  completed: boolean;
  seasonId?: string;
  episodeId?: string;
  seasonNumber?: number;
  episodeNumber?: number;
}

export interface WatchHistoryResponse {
  success: boolean;
}

export function watchHistoryUpdateItemToInput(
  item: WatchHistoryUpdateItem,
): WatchHistoryInput {
  return {
    duration: item.progress?.duration ?? 0,
    watched: item.progress?.watched ?? 0,
    watchedAt: item.watchedAt
      ? new Date(item.watchedAt).toISOString()
      : new Date().toISOString(),
    completed: item.completed ?? false,
    tmdbId: item.tmdbId,
    meta: {
      title: item.title ?? "",
      type: item.type ?? "",
      year: item.year ?? NaN,
      poster: item.poster,
    },
    episodeId: item.episodeId,
    seasonId: item.seasonId,
    episodeNumber: item.episodeNumber,
    seasonNumber: item.seasonNumber,
  };
}

export function watchHistoryItemToInputs(
  id: string,
  item: WatchHistoryItem,
): WatchHistoryInput {
  return {
    duration: item.progress.duration,
    watched: item.progress.watched,
    watchedAt: new Date(item.watchedAt).toISOString(),
    completed: item.completed,
    tmdbId: item.episodeId ? item.seasonId || id.split("-")[0] : id,
    meta: {
      title: item.title,
      type: item.type,
      year: item.year ?? NaN,
      poster: item.poster,
    },
    episodeId: item.episodeId,
    seasonId: item.seasonId,
    episodeNumber: item.episodeNumber,
    seasonNumber: item.seasonNumber,
  };
}

export function watchHistoryItemsToInputs(
  watchHistoryItems: Record<string, WatchHistoryItem>,
): WatchHistoryInput[] {
  return Object.entries(watchHistoryItems).map(([id, item]) =>
    watchHistoryItemToInputs(id, item),
  );
}

export async function setWatchHistory(
  _url: string,
  account: AccountWithToken,
  input: WatchHistoryInput,
) {
  await upsertWatchHistory(account.userId, input);
  return { success: true };
}

export async function removeWatchHistory(
  _url: string,
  account: AccountWithToken,
  id: string,
  episodeId?: string,
  seasonId?: string,
) {
  await sbDeleteWatchHistory(account.userId, id, episodeId);
}
