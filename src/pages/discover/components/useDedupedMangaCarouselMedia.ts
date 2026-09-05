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
 * Within-row collapse for manga discover, with popular-pool backfill.
 *
 * Do not depend on `media.length` or setState in effect cleanup — that nested
 * into React #185 on Firefox (MangaRecommendationsCarousel / discover home).
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
  const mediaLengthRef = useRef(0);

  useEffect(() => {
    setBackfill((prev) => (prev.length === 0 ? prev : []));
  }, [kind, priority, tagFilter]);

  const pooled = useMemo(() => {
    if (backfill.length === 0) return rawMedia;
    const seen = new Set(rawMedia.map((m) => String(m.id)));
    const extras = backfill.filter((m) => !seen.has(String(m.id)));
    return extras.length === 0 ? rawMedia : [...rawMedia, ...extras];
  }, [rawMedia, backfill]);

  const media = useDedupedMedia(priority, pooled);
  mediaLengthRef.current = media.length;

  useEffect(() => {
    if (!enabled || isLoading || !hasLoaded || priority === undefined) {
      setIsBackfilling((was) => (was ? false : was));
      return;
    }

    let cancelled = false;
    setIsBackfilling(true);

    (async () => {
      try {
        for (let round = 1; round <= 3; round += 1) {
          if (cancelled) return;
          if (mediaLengthRef.current >= CAROUSEL_DISPLAY_TARGET) return;

          const items = await listDiscoverManga({
            kind: "popular",
            limit: 32,
            page: priority + round,
            tagFilter,
          });
          if (cancelled) return;

          const slice = items.map(discoverMangaToMediaItem);
          setBackfill((prev) => {
            if (prev.length === 0) {
              return slice.length === 0 ? prev : slice;
            }
            const have = new Set(prev.map((p) => String(p.id)));
            const merged = [...prev];
            let added = 0;
            for (const item of slice) {
              const id = String(item.id);
              if (have.has(id)) continue;
              have.add(id);
              merged.push(item);
              added += 1;
            }
            return added === 0 ? prev : merged;
          });
          await new Promise<void>((r) => {
            window.setTimeout(r, 0);
          });
        }
      } catch (err) {
        console.error("Manga carousel backfill failed:", err);
      } finally {
        if (!cancelled) setIsBackfilling((was) => (was ? false : was));
      }
    })();

    return () => {
      cancelled = true;
      // Never setState in cleanup — that re-entered React #185 with media.length deps.
    };
  }, [enabled, isLoading, hasLoaded, priority, kind, tagFilter]);

  return { media, isBackfilling };
}

// Keep the kind union visible to callers that cast carousel kind strings.
export type { AniListDiscoverKind };
