import { useInitializePlayer } from "@/components/player/hooks/useInitializePlayer";
import {
  CaptionListItem,
  PlayerMeta,
  PlayerStatus,
  playerStatus,
} from "@/stores/player/slices/source";
import { usePlayerStore } from "@/stores/player/store";
import { SourceSliceSource } from "@/stores/player/utils/qualities";
import {
  ProgressItem,
  ProgressMediaItem,
  useProgressStore,
} from "@/stores/progress";

export interface Source {
  url: string;
  type: "hls" | "mp4";
}

/** Reopening something watched to the end should start it over, not park on the last frame. */
const RESUME_END_SLACK_SECONDS = 10;

export function resumePoint(progress: ProgressItem | undefined): number {
  if (!progress) return 0;
  const { watched, duration } = progress;
  if (duration > 0 && watched >= duration - RESUME_END_SLACK_SECONDS) return 0;
  return watched;
}

function getProgress(
  items: Record<string, ProgressMediaItem>,
  meta: PlayerMeta | null,
): number {
  const item = items[meta?.tmdbId ?? ""];
  if (!item || !meta) return 0;
  if (meta.type === "movie") return resumePoint(item.progress);

  const ep = item.episodes[meta.episode?.tmdbId ?? ""];
  return resumePoint(ep?.progress);
}

export function usePlayer() {
  const setStatus = usePlayerStore((s) => s.setStatus);
  const setMeta = usePlayerStore((s) => s.setMeta);
  const setSource = usePlayerStore((s) => s.setSource);
  const setCaption = usePlayerStore((s) => s.setCaption);
  const setSourceId = usePlayerStore((s) => s.setSourceId);
  const status = usePlayerStore((s) => s.status);
  const setEmbedId = usePlayerStore((s) => (s as any).setEmbedId);
  const shouldStartFromBeginning = usePlayerStore(
    (s) => s.interface.shouldStartFromBeginning,
  );
  const setShouldStartFromBeginning = usePlayerStore(
    (s) => s.setShouldStartFromBeginning,
  );
  const reset = usePlayerStore((s) => s.reset);
  const meta = usePlayerStore((s) => s.meta);
  const { init } = useInitializePlayer();

  return {
    meta,
    reset,
    status,
    shouldStartFromBeginning,
    setShouldStartFromBeginning,
    setStatus,
    setMeta(m: PlayerMeta, newStatus?: PlayerStatus) {
      setMeta(m, newStatus);
    },
    playMedia(
      source: SourceSliceSource,
      captions: CaptionListItem[],
      sourceId: string | null,
      startAtOverride?: number,
    ) {
      const start =
        startAtOverride ?? getProgress(useProgressStore.getState().items, meta);
      setCaption(null);
      setEmbedId(null);
      setSource(source, captions, start);
      setSourceId(sourceId);
      setStatus(playerStatus.PLAYING);
      init();
    },
    setScrapeStatus() {
      setStatus(playerStatus.SCRAPING);
    },
    setScrapeNotFound() {
      usePlayerStore.setState((s) => {
        s.status = playerStatus.SCRAPE_NOT_FOUND;
        s.sourceId = null;
        s.embedId = null;
        s.interface.error = undefined;
        s.mediaPlaying.hasPlayedOnce = false;
      });
      const display = usePlayerStore.getState().display;
      display?.load({
        source: null,
        startAt: 0,
        automaticQuality: false,
        preferredQuality: null,
      });
    },
  };
}
