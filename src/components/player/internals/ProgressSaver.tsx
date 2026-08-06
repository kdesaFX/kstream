import { useEffect, useRef } from "react";
import { useInterval } from "react-use";

import { playerStatus } from "@/stores/player/slices/source";
import { usePlayerStore } from "@/stores/player/store";
import {
  ProgressItem,
  progressIsCompleted,
  useProgressStore,
} from "@/stores/progress";
import { progressIsNotStarted } from "@/stores/progress/utils";

function shouldSaveProgress(
  meta: { type: string; tmdbId: string; season?: { tmdbId: string } },
  progress: ProgressItem,
  existingItems: Record<string, {
    episodes: Record<string, { seasonId: string; progress: ProgressItem }>;
  }>,
  lastSaved: ProgressItem | null,
): boolean {
  const { duration, watched } = progress;

  // Check if progress is acceptable
  const isNotStarted = progressIsNotStarted(duration, watched);
  const isCompleted = progressIsCompleted(duration, watched);
  const isAcceptable = !isNotStarted && !isCompleted;

  // Always allow one save when crossing into completed so watch history
  // (and the algorithm) still get the "finished" signal when people bail
  // during credits.
  const wasCompleted = lastSaved
    ? progressIsCompleted(lastSaved.duration, lastSaved.watched)
    : false;
  if (isCompleted && !wasCompleted) return true;

  // For movies, only save if acceptable
  if (meta.type === "movie") {
    return isAcceptable;
  }

  // For shows, save if acceptable OR if season has other watched episodes
  if (isAcceptable) return true;

  // Check if this season has other episodes with progress
  const showItem = existingItems[meta.tmdbId];
  if (!showItem || !meta.season) return false;

  const seasonEpisodes = Object.values(showItem.episodes).filter(
    (episode) => episode.seasonId === meta.season!.tmdbId,
  );

  // Check if any other episode in this season has acceptable progress
  return seasonEpisodes.some((episode) => {
    const epProgress = episode.progress;
    return (
      !progressIsNotStarted(epProgress.duration, epProgress.watched) &&
      !progressIsCompleted(epProgress.duration, epProgress.watched)
    );
  });
}

export function ProgressSaver() {
  const meta = usePlayerStore((s) => s.meta);
  const progress = usePlayerStore((s) => s.progress);
  const updateItem = useProgressStore((s) => s.updateItem);
  const progressItems = useProgressStore((s) => s.items);
  const status = usePlayerStore((s) => s.status);
  const hasPlayedOnce = usePlayerStore((s) => s.mediaPlaying.hasPlayedOnce);

  const lastSavedRef = useRef<ProgressItem | null>(null);

  const dataRef = useRef({
    updateItem,
    progressItems,
    meta,
    progress,
    status,
    hasPlayedOnce,
  });
  useEffect(() => {
    dataRef.current.updateItem = updateItem;
    dataRef.current.progressItems = progressItems;
    dataRef.current.meta = meta;
    dataRef.current.progress = progress;
    dataRef.current.status = status;
    dataRef.current.hasPlayedOnce = hasPlayedOnce;
  }, [updateItem, progressItems, progress, meta, status, hasPlayedOnce]);

  useInterval(() => {
    const d = dataRef.current;
    if (!d.progress || !d.meta || !d.updateItem) return;
    if (d.status !== playerStatus.PLAYING) return;
    if (!hasPlayedOnce) return;

    const previousSaved = lastSavedRef.current;
    let isDifferent = false;
    if (!previousSaved) isDifferent = true;
    else if (
      previousSaved.duration !== progress.duration ||
      previousSaved.watched !== progress.time
    )
      isDifferent = true;

    const nextProgress: ProgressItem = {
      duration: progress.duration,
      watched: progress.time,
    };
    lastSavedRef.current = nextProgress;

    if (
      isDifferent &&
      shouldSaveProgress(
        d.meta,
        nextProgress,
        d.progressItems,
        previousSaved,
      )
    )
      d.updateItem({
        meta: d.meta,
        progress: nextProgress,
      });
  }, 3000);

  return null;
}
