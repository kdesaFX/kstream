import {
  importBookmarksBulk,
  importMangaProgressBulk,
  importProgressBulk,
  importWatchHistoryBulk,
  upsertGroupOrder,
  upsertSettings,
} from "@/backend/supabase/data";
import { AccountWithToken } from "@/stores/auth";
import type { MangaProgressItem } from "@/stores/mangaProgress";

import { BookmarkInput } from "./bookmarks";
import { ProgressInput } from "./progress";
import { SettingsInput } from "./settings";
import { WatchHistoryInput } from "./watchHistory";

export function importProgress(
  _url: string,
  account: AccountWithToken,
  progressItems: ProgressInput[],
) {
  return importProgressBulk(account.userId, progressItems);
}

export function importBookmarks(
  _url: string,
  account: AccountWithToken,
  bookmarks: BookmarkInput[],
) {
  return importBookmarksBulk(account.userId, bookmarks);
}

export function importGroupOrder(
  _url: string,
  account: AccountWithToken,
  groupOrder: string[],
) {
  return upsertGroupOrder(account.userId, groupOrder);
}

export function importWatchHistory(
  _url: string,
  account: AccountWithToken,
  watchHistoryItems: WatchHistoryInput[],
) {
  return importWatchHistoryBulk(account.userId, watchHistoryItems);
}

export function importSettings(
  _url: string,
  account: AccountWithToken,
  settings: SettingsInput,
) {
  return upsertSettings(account.userId, settings);
}

export interface FullImportPayload {
  progressInputs: ProgressInput[];
  watchHistoryInputs: WatchHistoryInput[];
  bookmarkInputs: BookmarkInput[];
  groupOrder: string[];
  mangaProgress?: Record<string, MangaProgressItem>;
  settings?: SettingsInput;
}

export async function importAllUserData(
  _url: string,
  account: AccountWithToken,
  payload: FullImportPayload,
) {
  await Promise.all([
    importProgressBulk(account.userId, payload.progressInputs),
    importBookmarksBulk(account.userId, payload.bookmarkInputs),
    importWatchHistoryBulk(account.userId, payload.watchHistoryInputs),
    upsertGroupOrder(account.userId, payload.groupOrder),
    payload.mangaProgress
      ? importMangaProgressBulk(account.userId, payload.mangaProgress)
      : Promise.resolve(),
    payload.settings
      ? upsertSettings(account.userId, payload.settings)
      : Promise.resolve(),
  ]);
}
