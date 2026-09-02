import { useEffect, useMemo, useRef, useState } from "react";

import {
  discoverMangaToMediaItem,
  listDiscoverManga,
} from "@/backend/manga/discoverCatalog";
import type { AniListDiscoverKind } from "@/backend/manga/anilistDiscover";
import type { MangaGenreTagKey } from "@/backend/manga/mangaTags";
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
    isLoading?: boolean;
    kind?: string;
    tagFilter?: MangaGenreTagKey;
  } = {},
): { media: MediaItem[]; isBackfilling: boolean } {
  const {
    enabled = true,
    hasLoaded = true,
    isLoading = false,
    kind = "",
    tagFilter,
  } = options;
  const [backfill, setBackfill] = useState<MediaItem[]>([]);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const attemptsRef = useRef(0);

  useEffect(() => {
    setBackfill([]);
    attemptsRef.current = 0;
  }, [kind, priority, tagFilter]);

  const pooled = useMemo(() => {
    if (backfill.length === 0) return rawMedia;
    const seen = new Set(rawMedia.map((m) => String(m.id)));
    const extras = backfill.filter((m) => !seen.has(String(m.id)));
    return extras.length === 0 ? rawMedia : [...rawMedia, ...extras];
  }, [rawMedia, backfill]);

  const media = useDedupedMedia(priority, pooled);

  useEffect(() => {
    if (!enabled || isLoading || !hasLoaded || priority === undefined) return;
    if (media.length >= CAROUSEL_DISPLAY_TARGET) {
      setIsBackfilling(false);
      return;
    }
    if (attemptsRef.current >= 3) {
      setIsBackfilling(false);
      return;
    }

    const round = attemptsRef.current + 1;
    attemptsRef.current = round;

    let cancelled = false;
    setIsBackfilling(true);

    (async () => {
      try {
        const items = await listDiscoverManga({
          kind: "popular",
          limit: 32,
          page: priority + round,
          tagFilter,
        });
        if (cancelled) return;
        const slice = items.map(discoverMangaToMediaItem);
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
      } finally {
        if (!cancelled) setIsBackfilling(false);
      }
    })();

    return () => {
      cancelled = true;
      setIsBackfilling(false);
    };
  }, [
    enabled,
    isLoading,
    hasLoaded,
    priority,
    kind,
    media.length,
    tagFilter,
  ]);

  return { media, isBackfilling };
}

// Keep the kind union visible to callers that cast carousel kind strings.
export type { AniListDiscoverKind };
