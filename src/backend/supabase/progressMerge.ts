import type { ProgressInput } from "@/backend/accounts/progress";
import type { ProgressMediaItem } from "@/stores/progress";

export function progressInputToMediaItem(input: ProgressInput): ProgressMediaItem {
  const updatedAt = input.updatedAt
    ? new Date(input.updatedAt).getTime()
    : Date.now();
  if (input.meta?.type === "movie" || (!input.episodeId && !input.seasonId)) {
    return {
      title: input.meta?.title ?? "",
      poster: input.meta?.poster,
      type: "movie",
      year: input.meta?.year,
      updatedAt,
      episodes: {},
      seasons: {},
      progress: { duration: input.duration, watched: input.watched },
    };
  }
  const seasonId = input.seasonId ?? "";
  const episodeId = input.episodeId ?? "";
  return {
    title: input.meta?.title ?? "",
    poster: input.meta?.poster,
    type: "show",
    year: input.meta?.year,
    updatedAt,
    episodes: {
      [episodeId]: {
        id: episodeId,
        number: input.episodeNumber ?? 0,
        title: "",
        seasonId,
        updatedAt,
        progress: { duration: input.duration, watched: input.watched },
      },
    },
    seasons: {
      [seasonId]: {
        id: seasonId,
        number: input.seasonNumber ?? 0,
        title: "",
      },
    },
  };
}

export function mergeProgressPayload(
  existing: ProgressMediaItem | null,
  incoming: ProgressMediaItem,
  input: ProgressInput,
): ProgressMediaItem {
  if (!existing) return incoming;
  if (incoming.type === "movie") {
    return {
      ...existing,
      ...incoming,
      updatedAt: Math.max(existing.updatedAt, incoming.updatedAt),
      progress: incoming.progress,
    };
  }
  const episodeId = input.episodeId;
  if (!episodeId) return { ...existing, ...incoming };
  const seasonId = input.seasonId ?? "";
  return {
    ...existing,
    title: incoming.title || existing.title,
    poster: incoming.poster ?? existing.poster,
    year: incoming.year ?? existing.year,
    type: "show",
    updatedAt: Math.max(existing.updatedAt, incoming.updatedAt),
    seasons: {
      ...existing.seasons,
      ...(seasonId
        ? {
            [seasonId]: {
              id: seasonId,
              number: input.seasonNumber ?? existing.seasons[seasonId]?.number ?? 0,
              title: existing.seasons[seasonId]?.title ?? "",
            },
          }
        : {}),
    },
    episodes: {
      ...existing.episodes,
      [episodeId]: incoming.episodes[episodeId]!,
    },
  };
}

export function progressMediaItemToInputs(
  tmdbId: string,
  item: ProgressMediaItem,
): ProgressInput[] {
  if (item.type === "movie") {
    return [
      {
        tmdbId,
        duration: item.progress?.duration ?? 0,
        watched: item.progress?.watched ?? 0,
        updatedAt: new Date(item.updatedAt).toISOString(),
        meta: {
          title: item.title,
          type: item.type,
          year: item.year ?? 0,
          poster: item.poster,
        },
      },
    ];
  }
  return Object.values(item.episodes).map((episode) => ({
    tmdbId,
    duration: episode.progress.duration,
    watched: episode.progress.watched,
    episodeId: episode.id,
    seasonId: episode.seasonId,
    episodeNumber: episode.number,
    seasonNumber: item.seasons[episode.seasonId]?.number,
    updatedAt: new Date(episode.updatedAt).toISOString(),
    meta: {
      title: item.title,
      type: item.type,
      year: item.year ?? 0,
      poster: item.poster,
    },
  }));
}
