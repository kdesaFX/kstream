import type { ScrapeMedia } from "@p-stream/providers";

import type { PlayerMeta } from "@/stores/player/slices/source";
import type { ProgressMediaItem } from "@/stores/progress";
import type { SourceOrderContext } from "@/utils/media/sourceOrder";
import { hasProvenZeroHit } from "@/utils/media/sourceOrder";

export const WAY2_SOLO_SOURCE_ID = "way2movies";

export function hasWatchProgressForTitle(
  items: Record<string, ProgressMediaItem>,
  media: ScrapeMedia,
  meta: PlayerMeta | null,
): boolean {
  const item = items[media.tmdbId];
  if (!item) return false;
  if (media.type === "movie") {
    return (item.progress?.watched ?? 0) >= 30;
  }
  const episodeId = meta?.episode?.tmdbId;
  if (!episodeId) return false;
  const episode = item.episodes?.[episodeId];
  return (episode?.progress?.watched ?? 0) >= 30;
}

export function shouldTryWay2SoloFirst(
  sourceOrder: string[],
  preferredSourceId: string | null,
  opts: {
    startFromSourceId?: string;
    sourceOrderCtx: SourceOrderContext;
    isReturningViewer: boolean;
  },
): boolean {
  if (opts.startFromSourceId) return false;
  const index = sourceOrder.indexOf(WAY2_SOLO_SOURCE_ID);
  if (index === -1) return false;
  if (hasProvenZeroHit(WAY2_SOLO_SOURCE_ID, opts.sourceOrderCtx)) return false;
  if (preferredSourceId === WAY2_SOLO_SOURCE_ID) return true;
  // Way2 solo takes ~15s per attempt — on resume, parallel racing is faster.
  if (opts.isReturningViewer) return false;
  // Cold play: give Way2 a clean solo attempt when it would race near the front.
  return index < 2;
}
