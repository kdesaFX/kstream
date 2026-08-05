import { useEffect, useMemo, useRef, useState } from "react";

import { get } from "@/backend/metadata/tmdb";
import type { DiscoverMedia, MediaType } from "@/pages/discover/types/discover";
import { useLanguageStore } from "@/stores/language";
import { getTmdbLanguageCode } from "@/utils/locale/language";
import { detectUserRegion } from "@/utils/locale/userRegion";

import { useDedupedMedia } from "./CarouselDedupeContext";

/** Minimum posters for a "full" genre carousel after cross-row dedupe. */
export const CAROUSEL_DISPLAY_TARGET = 20;

/**
 * Dedupes `rawMedia`, then — when a genre chip is active and the row is
 * still short — pulls more discover titles (skipping ones already claimed
 * by earlier rows) so the carousel fills without doubles.
 */
export function useDedupedCarouselMedia(
  priority: number | undefined,
  rawMedia: DiscoverMedia[],
  options: {
    genreId?: string | null;
    mediaType: MediaType;
    enabled?: boolean;
    isLoading?: boolean;
    /** Bump when the carousel's primary query identity changes. */
    resetKey?: string;
  },
): DiscoverMedia[] {
  const {
    genreId = null,
    mediaType,
    enabled = true,
    isLoading = false,
    resetKey = "",
  } = options;

  const [backfill, setBackfill] = useState<DiscoverMedia[]>([]);
  const attemptsRef = useRef(0);
  const userLanguage = useLanguageStore((s) => s.language);
  const formattedLanguage = getTmdbLanguageCode(userLanguage);

  useEffect(() => {
    setBackfill([]);
    attemptsRef.current = 0;
  }, [genreId, mediaType, resetKey, priority]);

  const pooled = useMemo(() => {
    if (backfill.length === 0) return rawMedia;
    const seen = new Set(rawMedia.map((m) => m.id));
    const extras = backfill.filter((m) => m.id != null && !seen.has(m.id));
    return extras.length === 0 ? rawMedia : [...rawMedia, ...extras];
  }, [rawMedia, backfill]);

  const media = useDedupedMedia(priority, pooled);

  useEffect(() => {
    if (!enabled || isLoading || !genreId || priority === undefined) return;
    if (media.length >= CAROUSEL_DISPLAY_TARGET) return;
    // A couple of rounds in case concurrent rows claim the same fill batch.
    if (attemptsRef.current >= 2) return;

    const round = attemptsRef.current + 1;
    attemptsRef.current = round;

    let cancelled = false;
    const pageCount = 6;
    const startPage = Math.min(1 + priority * 2 + (round - 1) * pageCount, 30);
    const pages = Array.from({ length: pageCount }, (_, i) => startPage + i);

    (async () => {
      const need = CAROUSEL_DISPLAY_TARGET - media.length;

      try {
        const batches = await Promise.all(
          pages.map((page) =>
            get<{ results: DiscoverMedia[] }>(`/discover/${mediaType}`, {
              page,
              language: formattedLanguage,
              region: detectUserRegion(),
              sort_by: "popularity.desc",
              with_genres: genreId,
              include_adult: false,
              "vote_count.gte": 20,
            }),
          ),
        );

        if (cancelled) return;

        const seen = new Set<number>();
        const candidates: DiscoverMedia[] = [];
        for (const batch of batches) {
          for (const item of batch.results ?? []) {
            if (item?.id == null || seen.has(item.id)) continue;
            seen.add(item.id);
            candidates.push({
              ...item,
              type: mediaType === "movie" ? "movie" : "show",
            });
          }
        }

        // Surplus so claim/dedupe still leaves a full row.
        const slice = candidates.slice(0, need + 50);
        setBackfill((prev) => {
          if (prev.length === 0) return slice;
          const have = new Set(prev.map((p) => p.id));
          const merged = [...prev];
          for (const item of slice) {
            if (item.id == null || have.has(item.id)) continue;
            have.add(item.id);
            merged.push(item);
          }
          return merged;
        });
      } catch (err) {
        console.error("Genre carousel backfill failed:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    isLoading,
    genreId,
    mediaType,
    priority,
    resetKey,
    media.length,
    formattedLanguage,
  ]);

  return media;
}
