import type { BookmarkResponse, ProgressResponse, UserResponse, WatchHistoryResponse } from "@/backend/accounts/user";
import type { SettingsResponse } from "@/backend/accounts/settings";
import type { GroupOrderResponse } from "@/backend/accounts/groupOrder";
import type { MangaProgressItem } from "@/stores/mangaProgress";
import type { ProgressMediaItem } from "@/stores/progress";
import type { RatedMediaItem, AlgorithmPreferences } from "@/stores/ratings";
import type { WatchHistoryItem } from "@/stores/watchHistory";
import type { BookmarkMediaItem } from "@/stores/bookmarks";

export interface ProfileRow {
  id: string;
  nickname: string;
  color_a: string;
  color_b: string;
  icon: string;
  avatar_url: string | null;
  device_name: string | null;
  algorithm_prefs: AlgorithmPreferences;
}

export function profileToUser(profile: ProfileRow): UserResponse {
  return {
    id: profile.id,
    namespace: "kstream",
    nickname: profile.nickname,
    permissions: [],
    profile: {
      colorA: profile.color_a,
      colorB: profile.color_b,
      icon: profile.icon,
      avatarUrl: profile.avatar_url ?? null,
    },
  };
}

export function bookmarkRowToResponse(row: {
  tmdb_id: string;
  title: string;
  year: number | null;
  poster: string | null;
  type: string;
  groups: string[];
  favorite_episodes: string[];
  updated_at: string;
}): BookmarkResponse {
  return {
    tmdbId: row.tmdb_id,
    meta: {
      title: row.title,
      year: row.year ?? 0,
      poster: row.poster ?? undefined,
      type: row.type as "movie" | "show",
    },
    group: row.groups ?? [],
    favoriteEpisodes: row.favorite_episodes ?? [],
    updatedAt: row.updated_at,
  };
}

export function progressPayloadToResponses(
  tmdbId: string,
  payload: ProgressMediaItem,
): ProgressResponse[] {
  const out: ProgressResponse[] = [];
  const baseMeta = {
    title: payload.title,
    year: payload.year ?? 0,
    poster: payload.poster,
    type: payload.type,
  };
  if (payload.type === "movie" && payload.progress) {
    out.push({
      tmdbId,
      season: {},
      episode: {},
      meta: baseMeta,
      duration: String(payload.progress.duration),
      watched: String(payload.progress.watched),
      updatedAt: new Date(payload.updatedAt).toISOString(),
    });
    return out;
  }
  for (const episode of Object.values(payload.episodes ?? {})) {
    const season = payload.seasons?.[episode.seasonId];
    out.push({
      tmdbId,
      season: { id: episode.seasonId, number: season?.number },
      episode: { id: episode.id, number: episode.number },
      meta: baseMeta,
      duration: String(episode.progress.duration),
      watched: String(episode.progress.watched),
      updatedAt: new Date(episode.updatedAt).toISOString(),
    });
  }
  return out;
}

export function watchHistoryPayloadToResponse(
  entryId: string,
  payload: WatchHistoryItem,
): WatchHistoryResponse {
  const tmdbId = payload.episodeId
    ? entryId.split("-")[0] ?? entryId
    : entryId;
  return {
    tmdbId,
    season: { id: payload.seasonId, number: payload.seasonNumber },
    episode: { id: payload.episodeId, number: payload.episodeNumber },
    meta: {
      title: payload.title,
      year: payload.year ?? 0,
      poster: payload.poster,
      type: payload.type,
    },
    duration: String(payload.progress.duration),
    watched: String(payload.progress.watched),
    watchedAt: new Date(payload.watchedAt).toISOString(),
    completed: payload.completed,
  };
}

export function settingsPayloadToResponse(
  payload: Record<string, unknown>,
): SettingsResponse {
  return payload as SettingsResponse;
}

export function groupOrderRowToResponse(row: {
  groups: string[];
}): GroupOrderResponse {
  return { groupOrder: row.groups ?? [] };
}

export function bookmarkInputToRow(
  userId: string,
  input: {
    tmdbId: string;
    meta: { title: string; year: number; poster?: string; type: string };
    group?: string[];
    favoriteEpisodes?: string[];
  },
) {
  return {
    user_id: userId,
    tmdb_id: input.tmdbId,
    title: input.meta.title,
    year: input.meta.year,
    poster: input.meta.poster ?? null,
    type: input.meta.type,
    groups: input.group ?? [],
    favorite_episodes: input.favoriteEpisodes ?? [],
  };
}

export function bookmarkMediaToRow(userId: string, tmdbId: string, item: BookmarkMediaItem) {
  return {
    user_id: userId,
    tmdb_id: tmdbId,
    title: item.title,
    year: item.year ?? null,
    poster: item.poster ?? null,
    type: item.type,
    groups: item.group ?? [],
    favorite_episodes: item.favoriteEpisodes ?? [],
  };
}

export function mangaProgressToRow(userId: string, mangaId: string, item: MangaProgressItem) {
  return {
    user_id: userId,
    manga_id: mangaId,
    payload: item,
  };
}

export function ratingToRow(userId: string, tmdbId: string, item: RatedMediaItem) {
  return {
    user_id: userId,
    tmdb_id: tmdbId,
    payload: item,
  };
}
