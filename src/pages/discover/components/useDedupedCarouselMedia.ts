import { useEffect, useMemo, useRef, useState } from "react";

import { get } from "@/backend/metadata/tmdb";
import type { DiscoverMedia, MediaType } from "@/pages/discover/types/discover";
import { useLanguageStore } from "@/stores/language";
import { getTmdbLanguageCode } from "@/utils/locale/language";
import { detectUserRegion } from "@/utils/locale/userRegion";

import { useDedupedMedia } from "./CarouselDedupeContext";

/** Minimum posters for a "full" carousel after cross-row dedupe. */
export const CAROUSEL_DISPLAY_TARGET = 20;

/** Start backfill once a row drops below this count. */
const CAROUSEL_BACKFILL_TRIGGER = 16;

const MAX_BACKFILL_ATTEMPTS = 5;

export type CarouselBackfillMode = "popular" | "recent" | "trending";

/**
 * Dedupes `rawMedia`, then — when the row is still short — pulls more
 * discover/trending titles (skipping ones already claimed by earlier rows)
 * so the carousel fills without doubles.
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
    /**
     * popular — genre or general popularity pool.
     * recent — already-released theatrical in the last few years.
     * trending — TMDB trending/week (for Popular This Week rows).
     */
    backfillMode?: CarouselBackfillMode;
  },
): DiscoverMedia[] {
  const {
    genreId = null,
    mediaType,
    enabled = true,
    isLoading = false,
    resetKey = "",
    backfillMode = "popular",
  } = options;

  const [backfill, setBackfill] = useState<DiscoverMedia[]>([]);
  const attemptsRef = useRef(0);
  const userLanguage = useLanguageStore((s) => s.language);
  const formattedLanguage = getTmdbLanguageCode(userLanguage);

  useEffect(() => {
    setBackfill([]);
    attemptsRef.current = 0;
  }, [genreId, mediaType, resetKey, priority, backfillMode]);

  const pooled = useMemo(() => {
    if (backfill.length === 0) return rawMedia;
    const seen = new Set(rawMedia.map((m) => m.id));
    const extras = backfill.filter((m) => m.id != null && !seen.has(m.id));
    return extras.length === 0 ? rawMedia : [...rawMedia, ...extras];
  }, [rawMedia, backfill]);

  const media = useDedupedMedia(priority, pooled);

  useEffect(() => {
    if (!enabled || isLoading || priority === undefined) return;
    if (media.length >= CAROUSEL_BACKFILL_TRIGGER) return;
    if (attemptsRef.current >= MAX_BACKFILL_ATTEMPTS) return;

    const round = attemptsRef.current + 1;
    attemptsRef.current = round;

    let cancelled = false;
    const pageCount = 6;
    const startPage = Math.min(1 + priority * 2 + (round - 1) * pageCount, 30);
    const pages = Array.from({ length: pageCount }, (_, i) => startPage + i);

    (async () => {
      const need = CAROUSEL_DISPLAY_TARGET - media.length;
      const today = new Date().toISOString().slice(0, 10);
      const from = new Date();
      // Round 1: 2 years; round 2+: 5 years — still released, not future junk.
      from.setMonth(from.getMonth() - (round === 1 ? 24 : 60));

      try {
        let candidates: DiscoverMedia[] = [];

        if (backfillMode === "trending") {
          const endpoint =
            mediaType === "movie"
              ? "/trending/movie/week"
              : "/trending/tv/week";
          const batches = await Promise.all(
            pages.map((page) =>
              get<{ results: DiscoverMedia[] }>(endpoint, {
                language: formattedLanguage,
                page,
              }),
            ),
          );
          const seen = new Set<number>();
          for (const batch of batches) {
            for (const item of batch.results ?? []) {
              if (item?.id == null || seen.has(item.id)) continue;
              if (!item.poster_path) continue;
              const released = item.release_date || item.first_air_date || "";
              if (released.length < 10 || released > today) continue;
              seen.add(item.id);
              candidates.push({
                ...item,
                type: mediaType === "movie" ? "movie" : "show",
              });
            }
          }
        } else {
          const baseParams: Record<string, string | number | boolean> = {
            language: formattedLanguage,
            region: detectUserRegion(),
            sort_by: "popularity.desc",
            include_adult: false,
            "vote_count.gte": genreId ? 20 : 50,
          };

          if (genreId) {
            baseParams.with_genres = genreId;
          }

          if (backfillMode === "recent" && mediaType === "movie") {
            baseParams.with_release_type = "2|3";
          }
          if (mediaType === "movie") {
            baseParams["primary_release_date.gte"] = from
              .toISOString()
              .slice(0, 10);
            baseParams["primary_release_date.lte"] = today;
          } else {
            baseParams["first_air_date.gte"] = from.toISOString().slice(0, 10);
            baseParams["first_air_date.lte"] = today;
          }

          const batches = await Promise.all(
            pages.map((page) =>
              get<{ results: DiscoverMedia[] }>(`/discover/${mediaType}`, {
                ...baseParams,
                page,
              }),
            ),
          );

          const seen = new Set<number>();
          for (const batch of batches) {
            for (const item of batch.results ?? []) {
              if (item?.id == null || seen.has(item.id)) continue;
              if (!item.poster_path) continue;
              const released = item.release_date || item.first_air_date || "";
              if (released.length < 10 || released > today) continue;
              seen.add(item.id);
              candidates.push({
                ...item,
                type: mediaType === "movie" ? "movie" : "show",
              });
            }
          }
        }

        if (cancelled) return;

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
        console.error("Carousel backfill failed:", err);
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
    backfillMode,
    media.length,
    formattedLanguage,
  ]);

  return media;
}
