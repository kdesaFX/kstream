import type { ProgressResponse } from "@/backend/accounts/user";
import {
  deleteProgress as sbDeleteProgress,
  upsertProgress,
} from "@/backend/supabase/data";
import {
  progressInputToMediaItem,
  progressMediaItemToInputs,
} from "@/backend/supabase/progressMerge";
import { AccountWithToken } from "@/stores/auth";
import { ProgressMediaItem, ProgressUpdateItem } from "@/stores/progress";

export interface ProgressInput {
  meta?: {
    title: string;
    year: number;
    poster?: string;
    type: string;
  };
  tmdbId: string;
  watched: number;
  duration: number;
  seasonId?: string;
  episodeId?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  updatedAt?: string;
}

export function progressUpdateItemToInput(
  item: ProgressUpdateItem,
): ProgressInput {
  return {
    duration: item.progress?.duration ?? 0,
    watched: item.progress?.watched ?? 0,
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

export { progressMediaItemToInputs };

export async function setProgress(
  _url: string,
  account: AccountWithToken,
  input: ProgressInput,
): Promise<ProgressResponse> {
  await upsertProgress(account.userId, input);
  const item = progressInputToMediaItem(input);
  return {
    tmdbId: input.tmdbId,
    season: { id: input.seasonId, number: input.seasonNumber },
    episode: { id: input.episodeId, number: input.episodeNumber },
    meta: {
      title: input.meta?.title ?? "",
      year: input.meta?.year ?? 0,
      poster: input.meta?.poster,
      type: (input.meta?.type ?? "movie") as "movie" | "show",
    },
    duration: String(input.duration),
    watched: String(input.watched),
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  };
}

export async function removeProgress(
  _url: string,
  account: AccountWithToken,
  id: string,
  episodeId?: string,
  seasonId?: string,
) {
  await sbDeleteProgress(account.userId, id, episodeId, seasonId);
}
