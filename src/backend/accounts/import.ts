import { ofetch } from "ofetch";

import { getAuthHeaders } from "@/backend/accounts/auth";
import { AccountWithToken } from "@/stores/auth";

import { BookmarkInput } from "./bookmarks";
import { ProgressInput } from "./progress";
import { SettingsInput } from "./settings";
import { WatchHistoryInput } from "./watchHistory";

export function importProgress(
  url: string,
  account: AccountWithToken,
  progressItems: ProgressInput[],
) {
  return ofetch<void>(`/users/${account.userId}/progress/import`, {
    method: "PUT",
    body: progressItems,
    baseURL: url,
    headers: getAuthHeaders(account.token),
  });
}

export function importBookmarks(
  url: string,
  account: AccountWithToken,
  bookmarks: BookmarkInput[],
) {
  return ofetch<void>(`/users/${account.userId}/bookmarks`, {
    method: "PUT",
    body: bookmarks,
    baseURL: url,
    headers: getAuthHeaders(account.token),
  });
}

export function importGroupOrder(
  url: string,
  account: AccountWithToken,
  groupOrder: string[],
) {
  return ofetch<void>(`/users/${account.userId}/group-order`, {
    method: "PUT",
    body: groupOrder,
    baseURL: url,
    headers: getAuthHeaders(account.token),
  });
}

export function importWatchHistory(
  url: string,
  account: AccountWithToken,
  watchHistoryItems: WatchHistoryInput[],
) {
  return ofetch<void>(`/users/${account.userId}/watch-history/import`, {
    method: "PUT",
    body: watchHistoryItems,
    baseURL: url,
    headers: getAuthHeaders(account.token),
  });
}

export function importSettings(
  url: string,
  account: AccountWithToken,
  settings: SettingsInput,
) {
  return ofetch<void>(`/users/${account.userId}/settings`, {
    method: "PUT",
    body: settings,
    baseURL: url,
    headers: getAuthHeaders(account.token),
  });
}

export interface FullImportPayload {
  progressInputs: ProgressInput[];
  watchHistoryInputs: WatchHistoryInput[];
  bookmarkInputs: BookmarkInput[];
  groupOrder: string[];
  // Omit when merging local data into an already-configured existing account
  // (e.g. logging in from a new device) -- pushing this device's local
  // preferences would clobber settings the account already has configured
  // elsewhere. Pass it when seeding a brand-new account (registration/migration).
  settings?: SettingsInput;
}

// Single source of truth for pushing all local data to an account -- account
// creation (VerifyPassphrasePart), login (LoginFormPart), and account
// migration (useMigration) all call this instead of each hand-rolling their
// own subset, so they can't disagree about what gets imported again.
export async function importAllUserData(
  url: string,
  account: AccountWithToken,
  payload: FullImportPayload,
) {
  if (
    payload.progressInputs.length === 0 &&
    payload.watchHistoryInputs.length === 0 &&
    payload.bookmarkInputs.length === 0 &&
    payload.groupOrder.length === 0 &&
    !payload.settings
  ) {
    return;
  }

  const importPromises = [
    importProgress(url, account, payload.progressInputs),
    importWatchHistory(url, account, payload.watchHistoryInputs),
    importBookmarks(url, account, payload.bookmarkInputs),
  ];

  if (payload.groupOrder.length > 0) {
    importPromises.push(importGroupOrder(url, account, payload.groupOrder));
  }

  if (payload.settings) {
    importPromises.push(importSettings(url, account, payload.settings));
  }

  await Promise.all(importPromises);
}
