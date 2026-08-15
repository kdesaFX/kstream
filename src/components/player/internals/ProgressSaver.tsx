import { useEffect, useRef } from "react";
import { useInterval } from "react-use";

import { playerStatus } from "@/stores/player/slices/source";
import { usePlayerStore } from "@/stores/player/store";
import { ProgressItem, useProgressStore } from "@/stores/progress";

/** Save once past this so reloads can resume early in an episode. */
const MIN_RESUME_SECONDS = 15;

/**
 * Always keep the resume position current, including past the "completed"
 * mark — that flag only decides what Continue Watching and the algorithm do
 * with a title, and freezing saves there stranded reloads minutes behind.
 * The store still records a finished watch exactly once on the crossing.
 */
export function shouldSaveProgress(progress: ProgressItem): boolean {
  const { duration, watched } = progress;
  return duration > 0 && watched >= MIN_RESUME_SECONDS;
}

function trySave(
  d: {
    updateItem: ReturnType<typeof useProgressStore.getState>["updateItem"];
    meta: ReturnType<typeof usePlayerStore.getState>["meta"];
    progress: ReturnType<typeof usePlayerStore.getState>["progress"];
    status: ReturnType<typeof usePlayerStore.getState>["status"];
    hasPlayedOnce: boolean;
  },
  lastSavedRef: { current: ProgressItem | null },
) {
  if (!d.progress || !d.meta || !d.updateItem) return;
  if (d.status !== playerStatus.PLAYING) return;
  if (!d.hasPlayedOnce) return;

  const previousSaved = lastSavedRef.current;
  const nextProgress: ProgressItem = {
    duration: d.progress.duration,
    watched: d.progress.time,
  };

  const isDifferent =
    !previousSaved ||
    previousSaved.duration !== nextProgress.duration ||
    previousSaved.watched !== nextProgress.watched;

  if (!isDifferent) return;
  if (!shouldSaveProgress(nextProgress)) return;

  lastSavedRef.current = nextProgress;
  d.updateItem({
    meta: d.meta,
    progress: nextProgress,
  });
}

export function ProgressSaver() {
  const meta = usePlayerStore((s) => s.meta);
  const progress = usePlayerStore((s) => s.progress);
  const updateItem = useProgressStore((s) => s.updateItem);
  const status = usePlayerStore((s) => s.status);
  const hasPlayedOnce = usePlayerStore((s) => s.mediaPlaying.hasPlayedOnce);

  const lastSavedRef = useRef<ProgressItem | null>(null);

  const dataRef = useRef({
    updateItem,
    meta,
    progress,
    status,
    hasPlayedOnce,
  });
  useEffect(() => {
    dataRef.current.updateItem = updateItem;
    dataRef.current.meta = meta;
    dataRef.current.progress = progress;
    dataRef.current.status = status;
    dataRef.current.hasPlayedOnce = hasPlayedOnce;
  }, [updateItem, progress, meta, status, hasPlayedOnce]);

  useInterval(() => {
    trySave(dataRef.current, lastSavedRef);
  }, 3000);

  // Flush on reload / tab close so the last few seconds aren't lost.
  useEffect(() => {
    const flush = () => trySave(dataRef.current, lastSavedRef);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
