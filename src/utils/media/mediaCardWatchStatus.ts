import { PlayerMeta } from "@/stores/player/slices/source";
import {
  ProgressMediaItem,
  UpdateItemOptions,
  useProgressStore,
} from "@/stores/progress";
import {
  getProgressPercentage,
  shouldShowProgress,
} from "@/stores/progress/utils";
import { MediaItem } from "@/utils/media/mediaTypes";

export interface MediaCardSeriesContext {
  episode: number;
  season?: number;
  episodeId: string;
  seasonId: string;
}

export interface MediaCardWatchState {
  canToggle: boolean;
  isWatched: boolean;
  canReset: boolean;
}

function isProgressWatched(watched: number, duration: number): boolean {
  return getProgressPercentage(watched, duration) > 90;
}

function buildMeta(
  media: MediaItem,
  series?: MediaCardSeriesContext,
  progressItem?: ProgressMediaItem,
): PlayerMeta | null {
  if (media.type === "manga" || media.year === undefined) return null;

  if (media.type === "movie") {
    return {
      type: "movie",
      title: media.title,
      tmdbId: media.id,
      releaseYear: media.year,
      poster: media.poster,
    };
  }

  if (series) {
    const seasonNumber = series.season ?? 1;
    const seasonTitle =
      progressItem?.seasons?.[series.seasonId]?.title ?? `Season ${seasonNumber}`;
    const episodeTitle =
      progressItem?.episodes?.[series.episodeId]?.title ??
      `Episode ${series.episode}`;

    return {
      type: "show",
      title: media.title,
      tmdbId: media.id,
      releaseYear: media.year,
      poster: media.poster,
      season: {
        tmdbId: series.seasonId,
        number: seasonNumber,
        title: seasonTitle,
      },
      episode: {
        tmdbId: series.episodeId,
        number: series.episode,
        title: episodeTitle,
      },
    };
  }

  const active = progressItem ? shouldShowProgress(progressItem) : null;
  if (!active?.episode || !active.season) return null;

  return {
    type: "show",
    title: media.title,
    tmdbId: media.id,
    releaseYear: media.year,
    poster: media.poster,
    season: {
      tmdbId: active.season.id,
      number: active.season.number,
      title: active.season.title,
    },
    episode: {
      tmdbId: active.episode.id,
      number: active.episode.number,
      title: active.episode.title,
    },
  };
}

export function getMediaCardWatchState(
  media: MediaItem,
  progressItem: ProgressMediaItem | undefined,
  series?: MediaCardSeriesContext,
): MediaCardWatchState {
  if (media.type === "manga") {
    return { canToggle: false, isWatched: false, canReset: false };
  }

  if (media.type === "movie") {
    const progress = progressItem?.progress;
    const isWatched = progress
      ? isProgressWatched(progress.watched, progress.duration)
      : false;
    const canReset = Boolean(progress && progress.watched > 0);
    return { canToggle: true, isWatched, canReset };
  }

  const meta = buildMeta(media, series, progressItem);
  if (!meta?.episode) {
    return { canToggle: false, isWatched: false, canReset: false };
  }

  const episodeProgress =
    progressItem?.episodes?.[meta.episode.tmdbId]?.progress;
  const isWatched = episodeProgress
    ? isProgressWatched(episodeProgress.watched, episodeProgress.duration)
    : false;
  const canReset = Boolean(episodeProgress && episodeProgress.watched > 0);

  return { canToggle: true, isWatched, canReset };
}

export function buildWatchStatusUpdate(
  media: MediaItem,
  markWatched: boolean,
  series?: MediaCardSeriesContext,
  progressItem?: ProgressMediaItem,
): UpdateItemOptions | null {
  const meta = buildMeta(media, series, progressItem);
  if (!meta) return null;

  return {
    meta,
    progress: {
      watched: markWatched ? 60 : 0,
      duration: 60,
    },
  };
}

export function toggleMediaCardWatchStatus(
  media: MediaItem,
  series?: MediaCardSeriesContext,
): void {
  const progressItem = useProgressStore.getState().items[media.id];
  const state = getMediaCardWatchState(media, progressItem, series);
  if (!state.canToggle) return;

  const update = buildWatchStatusUpdate(
    media,
    !state.isWatched,
    series,
    progressItem,
  );
  if (!update) return;
  useProgressStore.getState().updateItem(update);
}

export function resetMediaCardProgress(
  media: MediaItem,
  series?: MediaCardSeriesContext,
): void {
  const progressItem = useProgressStore.getState().items[media.id];
  const update = buildWatchStatusUpdate(media, false, series, progressItem);
  if (!update) return;
  useProgressStore.getState().updateItem(update);
}
