import type { BookmarkResponse } from "@/backend/accounts/user";
import {
  deleteBookmark as sbDeleteBookmark,
  upsertBookmark,
} from "@/backend/supabase/data";
import { AccountWithToken } from "@/stores/auth";
import { BookmarkMediaItem } from "@/stores/bookmarks";

export interface BookmarkMetaInput {
  title: string;
  year: number;
  poster?: string;
  type: string;
}

export interface BookmarkInput {
  tmdbId: string;
  meta: BookmarkMetaInput;
  group?: string[];
  favoriteEpisodes?: string[];
}

export function bookmarkMediaToInput(
  tmdbId: string,
  item: BookmarkMediaItem,
): BookmarkInput {
  return {
    meta: {
      title: item.title,
      type: item.type,
      poster: item.poster,
      year: item.year ?? 0,
    },
    tmdbId,
    group: item.group,
    favoriteEpisodes: item.favoriteEpisodes,
  };
}

export async function addBookmark(
  _url: string,
  account: AccountWithToken,
  input: BookmarkInput,
): Promise<BookmarkResponse> {
  await upsertBookmark(account.userId, input);
  return {
    tmdbId: input.tmdbId,
    meta: {
      title: input.meta.title,
      year: input.meta.year,
      poster: input.meta.poster,
      type: input.meta.type as "movie" | "show",
    },
    group: input.group ?? [],
    favoriteEpisodes: input.favoriteEpisodes,
    updatedAt: new Date().toISOString(),
  };
}

export async function removeBookmark(
  _url: string,
  account: AccountWithToken,
  id: string,
) {
  await sbDeleteBookmark(account.userId, id);
  return { tmdbId: id };
}
