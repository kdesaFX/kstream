import { SessionResponse } from "@/backend/accounts/auth";
import {
  deleteAccount as sbDeleteAccount,
  fetchBookmarksPage,
  fetchProfile,
  fetchProgressPage,
  fetchWatchHistory,
  profileToUser,
  updateProfile,
} from "@/backend/supabase/data";
import { AccountWithToken, useAuthStore } from "@/stores/auth";
import { BookmarkMediaItem } from "@/stores/bookmarks";
import { ProgressMediaItem } from "@/stores/progress";
import { WatchHistoryItem } from "@/stores/watchHistory";

export interface UserResponse {
  id: string;
  namespace: string;
  nickname: string;
  permissions: string[];
  profile: {
    colorA: string;
    colorB: string;
    icon: string;
    avatarUrl?: string | null;
  };
}

export interface UserEdit {
  profile?: {
    colorA: string;
    colorB: string;
    icon: string;
    avatarUrl?: string | null;
  };
  nickname?: string;
}

export interface BookmarkResponse {
  tmdbId: string;
  meta: {
    title: string;
    year: number;
    poster?: string;
    type: "show" | "movie";
  };
  group: string[];
  favoriteEpisodes?: string[];
  updatedAt: string;
}

export interface ProgressResponse {
  tmdbId: string;
  season: {
    id?: string;
    number?: number;
  };
  episode: {
    id?: string;
    number?: number;
  };
  meta: {
    title: string;
    year: number;
    poster?: string;
    type: "show" | "movie";
  };
  duration: string;
  watched: string;
  updatedAt: string;
}

export interface WatchHistoryResponse {
  tmdbId: string;
  season: {
    id?: string;
    number?: number;
  };
  episode: {
    id?: string;
    number?: number;
  };
  meta: {
    title: string;
    year: number;
    poster?: string;
    type: "show" | "movie";
  };
  duration: string;
  watched: string;
  watchedAt: string;
  completed: boolean;
}

export function bookmarkResponsesToEntries(responses: BookmarkResponse[]) {
  const entries = responses.map((bookmark) => {
    const item: BookmarkMediaItem = {
      ...bookmark.meta,
      group: bookmark.group?.length > 0 ? bookmark.group : undefined,
      favoriteEpisodes: bookmark.favoriteEpisodes,
      updatedAt: new Date(bookmark.updatedAt).getTime(),
    };
    return [bookmark.tmdbId, item] as const;
  });

  return Object.fromEntries(entries);
}

export function progressResponsesToEntries(responses: ProgressResponse[]) {
  const items: Record<string, ProgressMediaItem> = {};

  responses.forEach((v) => {
    if (!items[v.tmdbId]) {
      items[v.tmdbId] = {
        title: v.meta.title,
        poster: v.meta.poster,
        type: v.meta.type,
        updatedAt: new Date(v.updatedAt).getTime(),
        episodes: {},
        seasons: {},
        year: v.meta.year,
      };
    }

    const item = items[v.tmdbId];

    // Since each watched episode is a single array entry but with the same tmdbId, the root item updatedAt will only have the first episode's timestamp (which is not the newest).
    // Here, we are setting it explicitly so the updatedAt always has the highest updatedAt from the episodes.
    if (new Date(v.updatedAt).getTime() > item.updatedAt) {
      item.updatedAt = new Date(v.updatedAt).getTime();
    }

    if (item.type === "movie") {
      item.progress = {
        duration: Number(v.duration),
        watched: Number(v.watched),
      };
    }

    if (item.type === "show" && v.season.id && v.episode.id) {
      item.seasons[v.season.id] = {
        id: v.season.id,
        number: v.season.number ?? 0,
        title: "",
      };
      item.episodes[v.episode.id] = {
        id: v.episode.id,
        number: v.episode.number ?? 0,
        title: "",
        progress: {
          duration: Number(v.duration),
          watched: Number(v.watched),
        },
        seasonId: v.season.id,
        updatedAt: new Date(v.updatedAt).getTime(),
      };
    }
  });

  return items;
}

export function mergeProgressItems(
  base: Record<string, ProgressMediaItem>,
  incoming: Record<string, ProgressMediaItem>,
): Record<string, ProgressMediaItem> {
  const merged = { ...base };
  Object.entries(incoming).forEach(([tmdbId, item]) => {
    const existing = merged[tmdbId];
    if (!existing) {
      merged[tmdbId] = item;
      return;
    }
    merged[tmdbId] = {
      ...existing,
      ...item,
      episodes: { ...existing.episodes, ...item.episodes },
      seasons: { ...existing.seasons, ...item.seasons },
      updatedAt: Math.max(existing.updatedAt, item.updatedAt),
    };
  });
  return merged;
}

export function watchHistoryResponsesToEntries(
  responses: WatchHistoryResponse[],
) {
  const items: Record<string, WatchHistoryItem> = {};

  responses.forEach((v) => {
    const key = v.episode?.id ? `${v.tmdbId}-${v.episode.id}` : v.tmdbId;

    items[key] = {
      type: v.meta.type,
      title: v.meta.title,
      poster: v.meta.poster,
      year: v.meta.year,
      progress: {
        duration: Number(v.duration),
        watched: Number(v.watched),
      },
      watchedAt: new Date(v.watchedAt).getTime(),
      completed: v.completed,
      episodeId: v.episode?.id,
      seasonId: v.season?.id,
      seasonNumber: v.season?.number,
      episodeNumber: v.episode?.number,
    };
  });

  return items;
}

export async function getUser(
  _url: string,
  _token: string,
): Promise<{ user: UserResponse; session: SessionResponse }> {
  const account = useAuthStore.getState().account;
  if (!account) throw new Error("Not signed in");
  const profile = await fetchProfile(account.userId);
  if (!profile) throw new Error("Profile not found");
  return {
    user: profileToUser(profile),
    session: {
      id: account.sessionId,
      userId: account.userId,
      createdAt: new Date().toISOString(),
      accessedAt: new Date().toISOString(),
      device: profile.device_name ?? account.deviceName,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    },
  };
}

export async function editUser(
  _url: string,
  account: AccountWithToken,
  object: UserEdit,
): Promise<{ user: UserResponse; session: SessionResponse }> {
  await updateProfile(account.userId, object);
  return getUser("", account.token);
}

export async function deleteUser(
  _url: string,
  account: AccountWithToken,
): Promise<UserResponse> {
  const profile = await fetchProfile(account.userId);
  await sbDeleteAccount();
  return profileToUser(profile!);
}

export async function getBookmarks(_url: string, account: AccountWithToken) {
  const page = await fetchBookmarksPage(account.userId, { limit: 10000 });
  return page.items;
}

export async function getProgress(_url: string, account: AccountWithToken) {
  const page = await fetchProgressPage(account.userId, { limit: 10000 });
  return page.items;
}

export interface PaginatedResponse<T> {
  items: T[];
  nextCursor: string | null;
}

export async function getBookmarksPage(
  _url: string,
  account: AccountWithToken,
  opts: { limit: number; cursor?: string },
) {
  return fetchBookmarksPage(account.userId, opts);
}

export async function getProgressPage(
  _url: string,
  account: AccountWithToken,
  opts: { limit: number; cursor?: string },
) {
  return fetchProgressPage(account.userId, opts);
}

export async function getWatchHistory(_url: string, account: AccountWithToken) {
  return fetchWatchHistory(account.userId);
}
