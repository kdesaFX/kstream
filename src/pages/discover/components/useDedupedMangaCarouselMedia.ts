import { useEffect, useMemo, useRef, useState } from "react";

import { listManga, mangaToMediaItem } from "@/backend/manga/mangadex";
import type { MediaItem } from "@/utils/media/mediaTypes";

import { useDedupedMedia } from "./CarouselDedupeContext";
import { CAROUSEL_DISPLAY_TARGET } from "./useDedupedCarouselMedia";

/**
 * Cross-row dedupe for manga discover rows, with popular-pool backfill so a
 * later carousel stays full after dropping titles claimed by earlier rows.
 */
export function useDedupedMangaCarouselMedia(
  priority: number | undefined,
  rawMedia: MediaItem[],
  options: {
    enabled?: boolean;
    hasLoaded?: boolean;
    kind?: string;
  } = {},
): MediaItem[] {
  const { enabled = true, hasLoaded = true, kind = "" } = options;
  const [backfill, setBackfill] = useState<MediaItem[]>([]);
  const attemptsRef = useRef(0);

  useEffect(() => {
    setBackfill([]);
    attemptsRef.current = 0;
  }, [kind, priority]);

  const pooled = useMemo(() => {
    if (backfill.length === 0) return rawMedia;
    const seen = new Set(rawMedia.map((m) => String(m.id)));
    const extras = backfill.filter((m) => !seen.has(String(m.id)));
    return extras.length === 0 ? rawMedia : [...rawMedia, ...extras];
  }, [rawMedia, backfill]);

  const media = useDedupedMedia(priority, pooled);

  useEffect(() => {
    if (!enabled || !hasLoaded || priority === undefined) return;
    if (media.length >= CAROUSEL_DISPLAY_TARGET) return;
    if (attemptsRef.current >= 3) return;

    const round = attemptsRef.current + 1;
    attemptsRef.current = round;

    let cancelled = false;
    const limit = 32;
    const offset = (priority + round) * limit;

    (async () => {
      try {
        const items = await listManga({
          order: "followedCount",
          limit,
          offset,
          includeStats: false,
        });
        if (cancelled) return;
        const slice = items.map(mangaToMediaItem);
        setBackfill((prev) => {
          if (prev.length === 0) return slice;
          const have = new Set(prev.map((p) => String(p.id)));
          const merged = [...prev];
          for (const item of slice) {
            const id = String(item.id);
            if (have.has(id)) continue;
            have.add(id);
            merged.push(item);
          }
          return merged;
        });
      } catch (err) {
        console.error("Manga carousel backfill failed:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, hasLoaded, priority, kind, media.length]);

  return media;
}
