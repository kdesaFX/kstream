import { useEffect, useMemo, useRef, useState } from "react";

import { get } from "@/backend/metadata/tmdb";
import type { DiscoverMedia, MediaType } from "@/pages/discover/types/discover";
import { useLanguageStore } from "@/stores/language";
import { usePreferencesStore } from "@/stores/preferences";
import { getTmdbLanguageCode } from "@/utils/locale/language";
import { detectUserRegion } from "@/utils/locale/userRegion";
import {
  filterOutMatureMedia,
  tmdbIncludeAdult,
} from "@/utils/media/mature";

import { useDedupedMedia } from "./CarouselDedupeContext";

/** Minimum posters for a "full" genre carousel after cross-row dedupe. */
export const CAROUSEL_DISPLAY_TARGET = 20;

export type CarouselBackfillMode = "none" | "popular" | "recent";

/**
 * Dedupes `rawMedia`, then — when the row is still short — pulls more
 * discover titles so the carousel fills without doubles.
 *
 * Backfill runs at most 3 rounds inside one effect when the row becomes ready.
 * It must NOT depend on `media.length` or setState in cleanup — that caused
 * React #185 (max update depth) on Firefox discover.
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
     * none — never pad (trending).
     * popular — genre popularity pool.
     * recent — already-released theatrical in the last few years (for the
     *          former "In Cinemas" row under a genre chip).
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
  const mediaLengthRef = useRef(0);
  const userLanguage = useLanguageStore((s) => s.language);
  const formattedLanguage = getTmdbLanguageCode(userLanguage);

  useEffect(() => {
    setBackfill((prev) => (prev.length === 0 ? prev : []));
  }, [genreId, mediaType, resetKey, priority, backfillMode]);

  const pooled = useMemo(() => {
    if (backfill.length === 0) return rawMedia;
    const seen = new Set(rawMedia.map((m) => m.id));
    const extras = backfill.filter((m) => m.id != null && !seen.has(m.id));
    return extras.length === 0 ? rawMedia : [...rawMedia, ...extras];
  }, [rawMedia, backfill]);

  const media = useDedupedMedia(priority, pooled);
  mediaLengthRef.current = media.length;

  useEffect(() => {
    if (!enabled || isLoading || priority === undefined) return;
    if (backfillMode === "none") return;

    let cancelled = false;
    const proxyTmdb = usePreferencesStore.getState().proxyTmdb;
    const pageCount = proxyTmdb ? 2 : 4;

    (async () => {
      for (let round = 1; round <= 3; round += 1) {
        if (cancelled) return;
        if (mediaLengthRef.current >= CAROUSEL_DISPLAY_TARGET) return;

        const need = CAROUSEL_DISPLAY_TARGET - mediaLengthRef.current;
        const startPage = Math.min(
          1 + (priority + round - 1) * pageCount,
          41 - pageCount,
        );
        const pages = Array.from(
          { length: pageCount },
          (_, i) => startPage + i,
        );
        const today = new Date().toISOString().slice(0, 10);
        const from = new Date();
        from.setMonth(from.getMonth() - (round === 1 ? 24 : 60));

        const baseParams: Record<string, string | number | boolean> = {
          language: formattedLanguage,
          region: detectUserRegion(),
          sort_by: "popularity.desc",
          include_adult: tmdbIncludeAdult(),
          "vote_count.gte": 20,
        };
        if (genreId) baseParams.with_genres = genreId;

        if (backfillMode === "recent" && mediaType === "movie") {
          baseParams.with_release_type = "2|3";
        }
        if (mediaType === "movie") {
          baseParams["primary_release_date.gte"] =
            from.toISOString().slice(0, 10);
          baseParams["primary_release_date.lte"] = today;
        } else {
          baseParams["first_air_date.gte"] = from.toISOString().slice(0, 10);
          baseParams["first_air_date.lte"] = today;
        }

        try {
          const batches = await Promise.all(
            pages.map((page) =>
              get<{ results: DiscoverMedia[] }>(`/discover/${mediaType}`, {
                ...baseParams,
                page,
              }),
            ),
          );

          if (cancelled) return;

          const seen = new Set<number>();
          const candidates: DiscoverMedia[] = [];
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
                adult: item.adult === true,
              });
            }
          }

          const slice = filterOutMatureMedia(candidates).slice(0, need + 50);
          setBackfill((prev) => {
            if (prev.length === 0) {
              return slice.length === 0 ? prev : slice;
            }
            const have = new Set(prev.map((p) => p.id));
            const merged = [...prev];
            let added = 0;
            for (const item of slice) {
              if (item.id == null || have.has(item.id)) continue;
              have.add(item.id);
              merged.push(item);
              added += 1;
            }
            return added === 0 ? prev : merged;
          });
          // Allow React to commit length before the next round.
          await new Promise<void>((r) => {
            window.setTimeout(r, 0);
          });
        } catch (err) {
          console.error("Genre carousel backfill failed:", err);
          return;
        }
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
    formattedLanguage,
  ]);

  return media;
}
