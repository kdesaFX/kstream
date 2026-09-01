import { FullScraperEvents, RunOutput, ScrapeMedia } from "@p-stream/providers";
import { RefObject, useCallback, useEffect, useRef, useState } from "react";

import { isExtensionActiveCached } from "@/backend/extension/messaging";
import { prepareStream } from "@/backend/extension/streams";
import { validateRunOutput } from "@/components/player/utils/validateScrapedStream";
import {
  getCachedMetadata,
  setCachedMetadata,
} from "@/backend/helpers/providerApi";
import { getProviders } from "@/backend/providers/providers";
import {
  currentSourceAfterUpdate,
  currentSourceOnStart,
  shouldIgnoreStaleProgress,
  type ScrapingItems,
  type ScrapingSegment,
} from "@/hooks/scrapeEvents";
import { getMediaKey } from "@/stores/player/slices/source";
import { usePlayerStore } from "@/stores/player/store";
import {
  getPreferredSourceForTitle,
  usePreferencesStore,
} from "@/stores/preferences";
import { isAnimeSourceId, isAnimeTitle } from "@/utils/media/anime";
import { excludeDeferredFromPrimary } from "@/utils/media/regionalSources";
import {
  orderSourceIdsForPlayback,
  detectPlaybackEnv,
  prioritizeConfiguredSources,
} from "@/utils/media/sourceOrder";

export type { ScrapingItems, ScrapingSegment } from "@/hooks/scrapeEvents";

const sourceQualityScore: Record<string, number> = {
  unknown: 0,
  "360": 360,
  "480": 480,
  "720": 720,
  "1080": 1080,
  "4k": 2160,
};

const minimumResolutionThreshold: Record<
  "none" | "720" | "1080" | "4k",
  number
> = {
  none: 0,
  "720": 720,
  "1080": 1080,
  "4k": 2160,
};

/** Adaptive streams (HLS/etc.) don't expose discrete file qualities — treat as satisfying any preferred minimum. */
const ADAPTIVE_STREAM_RESOLUTION_SCORE = sourceQualityScore["4k"];

function getRunOutputBestResolutionScore(output: RunOutput): number {
  if (output.stream.type !== "file") return ADAPTIVE_STREAM_RESOLUTION_SCORE;

  return Object.entries(output.stream.qualities).reduce(
    (best, [quality, stream]) => {
      if (!stream?.url) return best;
      return Math.max(best, sourceQualityScore[quality] ?? 0);
    },
    0,
  );
}

type ScraperEvent<Event extends keyof FullScraperEvents> = Parameters<
  NonNullable<FullScraperEvents[Event]>
>[0];

function useBaseScrape() {
  const [sources, setSources] = useState<Record<string, ScrapingSegment>>({});
  const [sourceOrder, setSourceOrder] = useState<ScrapingItems[]>([]);
  const [currentSource, setCurrentSource] = useState<string>();
  const sourcesRef = useRef(sources);
  const sourceOrderRef = useRef(sourceOrder);
  sourcesRef.current = sources;
  sourceOrderRef.current = sourceOrder;

  const initEvent = useCallback((evt: ScraperEvent<"init">) => {
    // A second runAll (min-resolution loop) must not wipe in-flight cards —
    // that restarts the scrape animation from waiting/0%.
    setSources((existing) => {
      if (Object.keys(existing).length > 0) {
        const next = { ...existing };
        for (const id of evt.sourceIds) {
          if (next[id]) continue;
          const source = getCachedMetadata().find((s) => s.id === id);
          next[id] = {
            name: source?.name ?? id,
            id,
            status: "waiting",
            percentage: 0,
          };
        }
        return next;
      }
      return evt.sourceIds
        .map((v) => {
          const source = getCachedMetadata().find((s) => s.id === v);
          const out: ScrapingSegment = {
            name: source?.name ?? v,
            id: v,
            status: "waiting",
            percentage: 0,
          };
          return out;
        })
        .reduce<Record<string, ScrapingSegment>>((a, v) => {
          a[v.id] = v;
          return a;
        }, {});
    });
    setSourceOrder((existing) => {
      if (existing.length > 0) return existing;
      return evt.sourceIds.map((v) => ({ id: v, children: [] }));
    });
  }, []);

  const startEvent = useCallback((id: ScraperEvent<"start">) => {
    setSources((s) => {
      if (!s[id]) return s;
      return { ...s, [id]: { ...s[id], status: "pending" } };
    });
    setCurrentSource((current) =>
      currentSourceOnStart(
        current,
        id,
        sourcesRef.current,
        sourceOrderRef.current,
      ),
    );
  }, []);

  const updateEvent = useCallback((evt: ScraperEvent<"update">) => {
    setSources((s) => {
      const existing = s[evt.id];
      if (shouldIgnoreStaleProgress(existing, evt.status)) return s;
      if (!existing) return s;
      return {
        ...s,
        [evt.id]: {
          ...existing,
          status: evt.status,
          reason: evt.reason,
          error: evt.error,
          percentage: evt.percentage,
        },
      };
    });
  }, []);

  useEffect(() => {
    setCurrentSource((current) =>
      currentSourceAfterUpdate(current, sources, sourceOrder),
    );
  }, [sources, sourceOrder]);

  const discoverEmbedsEvent = useCallback(
    (evt: ScraperEvent<"discoverEmbeds">) => {
      setSources((s) => {
        const next = { ...s };
        evt.embeds.forEach((v) => {
          const source = getCachedMetadata().find(
            (src) => src.id === v.embedScraperId,
          );
          next[v.id] = {
            embedId: v.embedScraperId,
            name: source?.name ?? v.embedScraperId,
            id: v.id,
            status: "waiting",
            percentage: 0,
          };
        });
        return next;
      });
      setSourceOrder((s) =>
        s.map((source) =>
          source.id === evt.sourceId
            ? { ...source, children: evt.embeds.map((v) => v.id) }
            : source,
        ),
      );
    },
    [],
  );

  const startScrape = useCallback(() => {
    // Race-safe: per-source progress lives on the runner now, not a shared lastId.
  }, []);

  const getResult = useCallback((output: RunOutput | null) => {
    setSources((s) => {
      const next = { ...s };
      // Clear cards still spinning when the run ends (parents left pending
      // after embeds missed, race losers). On total miss, also settle waiting.
      for (const [id, seg] of Object.entries(next)) {
        const stuckPending = seg.status === "pending";
        const stuckWaiting = !output && seg.status === "waiting";
        if (stuckPending || stuckWaiting) {
          next[id] = {
            ...seg,
            status: "notfound",
            percentage: 100,
            reason: seg.reason ?? "No streams found",
          };
        }
      }
      if (!output) return next;
      if (next[output.sourceId]) {
        next[output.sourceId] = { ...next[output.sourceId], status: "success" };
      }
      if (output.embedId) {
        for (const [id, seg] of Object.entries(next)) {
          if (
            seg.embedId === output.embedId &&
            (seg.status === "pending" ||
              seg.status === "waiting" ||
              seg.status === "notfound")
          ) {
            next[id] = { ...seg, status: "success", percentage: 100 };
          }
        }
      }
      return next;
    });
    if (!output) return output;
    setCurrentSource(output.sourceId);
    return output;
  }, []);

  return {
    initEvent,
    startEvent,
    updateEvent,
    discoverEmbedsEvent,
    startScrape,
    getResult,
    sources,
    sourceOrder,
    currentSource,
  };
}

export function useScrape() {
  const {
    sources,
    sourceOrder,
    currentSource,
    updateEvent,
    discoverEmbedsEvent,
    initEvent,
    getResult,
    startEvent,
    startScrape,
  } = useBaseScrape();

  const preferredSourceOrder = usePreferencesStore((s) => s.sourceOrder);
  const enableSourceOrder = usePreferencesStore((s) => s.enableSourceOrder);
  const lastSuccessfulSource = usePreferencesStore(
    (s) => s.lastSuccessfulSource,
  );
  const preferredSourceByTitle = usePreferencesStore(
    (s) => s.preferredSourceByTitle,
  );
  const enableLastSuccessfulSource = usePreferencesStore(
    (s) => s.enableLastSuccessfulSource,
  );
  const preferredEmbedOrder = usePreferencesStore((s) => s.embedOrder);
  const enableEmbedOrder = usePreferencesStore((s) => s.enableEmbedOrder);
  const preferredMinimumResolution = usePreferencesStore(
    (s) => s.preferredMinimumResolution,
  );
  const debridToken = usePreferencesStore((s) => s.debridToken);

  const startScraping = useCallback(
    async (media: ScrapeMedia, startFromSourceId?: string) => {
      // Browser path hits same-origin proxies; wait briefly so cold edges
      // don't fail the whole first scrape after reopening the site.
      const { ensureSameOriginProxiesWarm } = await import(
        "@/backend/providers/providers"
      );
      await ensureSameOriginProxiesWarm();

      const providerInstance = getProviders();
      // Keep scrape UI metadata in sync with the live provider list used below
      setCachedMetadata([
        ...providerInstance.listSources(),
        ...providerInstance.listEmbeds(),
      ]);
      const allSources = providerInstance.listSources();
      const playerState = usePlayerStore.getState();

      // Get media-specific failed sources/embeds
      // Try to get media key from player state first, fallback to deriving from ScrapeMedia
      let mediaKey = getMediaKey(playerState.meta);
      if (!mediaKey) {
        // Derive media key from ScrapeMedia if meta is not set yet
        if (media.type === "movie") {
          mediaKey = `movie-${media.tmdbId}`;
        } else if (media.type === "show" && media.season && media.episode) {
          mediaKey = `show-${media.tmdbId}-${media.season.tmdbId}-${media.episode.tmdbId}`;
        } else if (media.type === "show") {
          mediaKey = `show-${media.tmdbId}`;
        }
      }
      const failedSources = mediaKey
        ? playerState.failedSourcesPerMedia[mediaKey] || []
        : [];
      const failedEmbeds = mediaKey
        ? playerState.failedEmbedsPerMedia[mediaKey] || {}
        : {};

      // Start with all available sources (DO NOT filter failed ones yet, so we can find startFromSourceId)
      let baseSourceOrder = excludeDeferredFromPrimary(
        allSources.map((source) => source.id),
      );

      // Apply custom source ordering if enabled
      if (enableSourceOrder && (preferredSourceOrder || []).length > 0) {
        const orderedSources: string[] = [];
        const remainingSources = [...baseSourceOrder];

        // Add sources in preferred order
        for (const sourceId of preferredSourceOrder) {
          const sourceIndex = remainingSources.indexOf(sourceId);
          if (sourceIndex !== -1) {
            orderedSources.push(sourceId);
            remainingSources.splice(sourceIndex, 1);
          }
        }

        // Add remaining sources
        baseSourceOrder = [...orderedSources, ...remainingSources];
      }

      // Goon-test stats: order by env (browser/extension/desktop) × media bucket.
      baseSourceOrder = prioritizeConfiguredSources(
        orderSourceIdsForPlayback(baseSourceOrder, {
          env: detectPlaybackEnv(),
          mediaType: media.type === "show" ? "show" : "movie",
          meta: playerState.meta,
        }),
        { hasDebridToken: Boolean(debridToken?.trim()) },
      );

      // Prefer the source that worked for this title.
      // On anime, never let a remembered general source (Reyna, etc.) jump
      // ahead of TQQ / other anime specialists.
      if (enableLastSuccessfulSource) {
        const prioritizeSource = getPreferredSourceForTitle(
          preferredSourceByTitle,
          media.tmdbId,
          lastSuccessfulSource,
        );
        if (prioritizeSource && baseSourceOrder.includes(prioritizeSource)) {
          const anime = isAnimeTitle(playerState.meta);
          if (!anime || isAnimeSourceId(prioritizeSource)) {
            baseSourceOrder = [
              prioritizeSource,
              ...baseSourceOrder.filter((id) => id !== prioritizeSource),
            ];
          }
        }
      }

      // If starting from a specific source ID, filter the order to start AFTER that source
      // This preserves the custom order while starting from the next source
      let filteredSourceOrder = baseSourceOrder;
      if (startFromSourceId) {
        const startIndex = filteredSourceOrder.indexOf(startFromSourceId);
        if (startIndex !== -1) {
          filteredSourceOrder = filteredSourceOrder.slice(startIndex + 1);
        }
        // Always exclude the resume id for this run (covers missing-index / stale id cases)
        filteredSourceOrder = filteredSourceOrder.filter(
          (id) => id !== startFromSourceId,
        );
      }

      // Now filter out the failed sources so we don't try them again
      filteredSourceOrder = filteredSourceOrder.filter(
        (id) => !failedSources.includes(id),
      );

      // Resuming past the last source leaves nothing behind it on a cold scrape.
      // Playback retries must not wrap back to cornclick / sources already tried.
      const isPlaybackRetry = Boolean(startFromSourceId);
      if (filteredSourceOrder.length === 0 && !isPlaybackRetry) {
        filteredSourceOrder = baseSourceOrder.filter(
          (id) => !failedSources.includes(id),
        );
      }

      if (filteredSourceOrder.length === 0 && !isPlaybackRetry) {
        filteredSourceOrder = [...baseSourceOrder];
      }

      // Collect failed embed IDs for this media and always exclude them.
      // (Previously only applied when custom embed order was enabled, so TQQ
      // mirrors marked bad on playback were still retried / whole source skipped.)
      const allFailedEmbedIds = Object.values(failedEmbeds).flat();
      const failedEmbedIdSet = new Set(allFailedEmbedIds);
      const providers = getProviders();
      const allEmbedIds = providers.listEmbeds().map((e) => e.id);

      let filteredEmbedOrder: string[] | undefined;
      if (enableEmbedOrder && (preferredEmbedOrder || []).length > 0) {
        const ordered: string[] = [];
        for (const sourceId of preferredEmbedOrder) {
          if (
            !failedEmbedIdSet.has(sourceId) &&
            allEmbedIds.includes(sourceId)
          ) {
            ordered.push(sourceId);
          }
        }
        for (const embedId of allEmbedIds) {
          if (!failedEmbedIdSet.has(embedId) && !ordered.includes(embedId)) {
            ordered.push(embedId);
          }
        }
        filteredEmbedOrder = ordered;
      } else if (failedEmbedIdSet.size > 0) {
        filteredEmbedOrder = allEmbedIds.filter(
          (id) => !failedEmbedIdSet.has(id),
        );
      }

      const minimumResolutionScore =
        minimumResolutionThreshold[preferredMinimumResolution] ?? 0;

      const markSourceRejected = (sourceId: string, reason: string) => {
        updateEvent({
          id: sourceId,
          percentage: 100,
          status: "notfound",
          reason,
        });
      };

      const runEvents = {
        init: initEvent,
        start: startEvent,
        update: updateEvent,
        discoverEmbeds: discoverEmbedsEvent,
      };

      const acceptValidatedOutput = async (
        output: RunOutput,
      ): Promise<RunOutput | null> => {
        const check = await validateRunOutput(output);
        if (check.ok) {
          const accepted = { ...output, stream: check.stream };
          if (isExtensionActiveCached()) await prepareStream(check.stream);
          return accepted;
        }
        markSourceRejected(output.sourceId, check.reason);
        return null;
      };

      startScrape();

      if (minimumResolutionScore <= 0) {
        let remainingSourceOrder = [...filteredSourceOrder];
        while (remainingSourceOrder.length > 0) {
          const output = await providers.runAll({
            media,
            sourceOrder: remainingSourceOrder,
            embedOrder: filteredEmbedOrder,
            restrictToOrder: true,
            events: runEvents,
          });
          if (!output) break;
          const accepted = await acceptValidatedOutput(output);
          if (accepted) return getResult(accepted);
          const currentSourceIndex = remainingSourceOrder.indexOf(
            output.sourceId,
          );
          if (currentSourceIndex === -1) break;
          remainingSourceOrder = remainingSourceOrder.slice(
            currentSourceIndex + 1,
          );
        }
        return getResult(null);
      }

      let remainingSourceOrder = [...filteredSourceOrder];
      let bestFallbackOutput: RunOutput | null = null;
      let bestFallbackScore = -1;

      while (remainingSourceOrder.length > 0) {
        const output = await providers.runAll({
          media,
          sourceOrder: remainingSourceOrder,
          embedOrder: filteredEmbedOrder,
          restrictToOrder: true,
          events: runEvents,
        });

        if (!output) break;

        const sourceScore = getRunOutputBestResolutionScore(output);
        if (sourceScore > bestFallbackScore) {
          bestFallbackScore = sourceScore;
          bestFallbackOutput = output;
        }

        if (sourceScore >= minimumResolutionScore) {
          const accepted = await acceptValidatedOutput(output);
          if (accepted) return getResult(accepted);
          const currentSourceIndex = remainingSourceOrder.indexOf(
            output.sourceId,
          );
          if (currentSourceIndex === -1) break;
          remainingSourceOrder = remainingSourceOrder.slice(
            currentSourceIndex + 1,
          );
          continue;
        }

        markSourceRejected(
          output.sourceId,
          `Below ${preferredMinimumResolution} minimum`,
        );

        const currentSourceIndex = remainingSourceOrder.indexOf(
          output.sourceId,
        );
        if (currentSourceIndex === -1) break;
        remainingSourceOrder = remainingSourceOrder.slice(
          currentSourceIndex + 1,
        );
      }

      if (bestFallbackOutput) {
        const accepted = await acceptValidatedOutput(bestFallbackOutput);
        if (accepted) return getResult(accepted);
      }
      return getResult(null);
    },
    [
      initEvent,
      startEvent,
      updateEvent,
      discoverEmbedsEvent,
      getResult,
      startScrape,
      preferredSourceOrder,
      enableSourceOrder,
      lastSuccessfulSource,
      preferredSourceByTitle,
      enableLastSuccessfulSource,
      preferredEmbedOrder,
      enableEmbedOrder,
      preferredMinimumResolution,
      debridToken,
      updateEvent,
    ],
  );

  const resumeScraping = useCallback(
    async (media: ScrapeMedia, startFromSourceId: string) => {
      return startScraping(media, startFromSourceId);
    },
    [startScraping],
  );

  return {
    startScraping,
    resumeScraping,
    sourceOrder,
    sources,
    currentSource,
  };
}

/**
 * Centres the whole scrape list in its container. Anchoring on a single card
 * left the list bottom-heavy once several sources raced at once, so the block
 * is centred as a unit and pinned to the top only when it outgrows the frame.
 */
export function useListCenter(
  containerRef: RefObject<HTMLDivElement | null>,
  listRef: RefObject<HTMLDivElement | null>,
  sourceOrder: ScrapingItems[],
) {
  const [renderedOnce, setRenderedOnce] = useState(false);

  const updatePosition = useCallback(() => {
    if (!containerRef.current) return;
    if (!listRef.current) return;

    const container = containerRef.current.getBoundingClientRect();
    const list = listRef.current.getBoundingClientRect();

    // translate() does not affect the measured box, so these stay stable
    // across repositions.
    const listNewLeft = container.width / 2 - list.width / 2;
    const listNewTop = Math.max(0, container.height / 2 - list.height / 2);

    listRef.current.style.transform = `translateY(${listNewTop}px) translateX(${listNewLeft}px)`;
    setTimeout(() => {
      setRenderedOnce(true);
    }, 150);
  }, [containerRef, listRef, setRenderedOnce]);

  const updatePositionRef = useRef(updatePosition);

  useEffect(() => {
    updatePosition();
    updatePositionRef.current = updatePosition;
  }, [updatePosition, sourceOrder]);

  useEffect(() => {
    function resize() {
      updatePositionRef.current();
    }
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
    };
  }, []);

  // Cards grow as embeds appear and statuses gain reason text — re-centre
  // instead of drifting off-centre for the rest of the scrape.
  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      updatePositionRef.current();
    });
    observer.observe(list);
    return () => {
      observer.disconnect();
    };
  }, [listRef]);

  return renderedOnce;
}
