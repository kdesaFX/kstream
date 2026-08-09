import { FullScraperEvents, RunOutput, ScrapeMedia } from "@p-stream/providers";
import { RefObject, useCallback, useEffect, useRef, useState } from "react";

import { isExtensionActiveCached } from "@/backend/extension/messaging";
import { prepareStream } from "@/backend/extension/streams";
import {
  getCachedMetadata,
  setCachedMetadata,
} from "@/backend/helpers/providerApi";
import { getProviders } from "@/backend/providers/providers";
import { getMediaKey } from "@/stores/player/slices/source";
import { usePlayerStore } from "@/stores/player/store";
import {
  getPreferredSourceForTitle,
  usePreferencesStore,
} from "@/stores/preferences";

export interface ScrapingItems {
  id: string;
  children: string[];
}

export interface ScrapingSegment {
  name: string;
  id: string;
  embedId?: string;
  status: "failure" | "pending" | "notfound" | "success" | "waiting";
  reason?: string;
  error?: any;
  percentage: number;
}

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

  return Object.entries(output.stream.qualities).reduce((best, [quality, stream]) => {
    if (!stream?.url) return best;
    return Math.max(best, sourceQualityScore[quality] ?? 0);
  }, 0);
}

type ScraperEvent<Event extends keyof FullScraperEvents> = Parameters<
  NonNullable<FullScraperEvents[Event]>
>[0];

function useBaseScrape() {
  const [sources, setSources] = useState<Record<string, ScrapingSegment>>({});
  const [sourceOrder, setSourceOrder] = useState<ScrapingItems[]>([]);
  const [currentSource, setCurrentSource] = useState<string>();
  const lastId = useRef<string | null>(null);

  const initEvent = useCallback((evt: ScraperEvent<"init">) => {
    setSources(
      evt.sourceIds
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
        }, {}),
    );
    setSourceOrder(evt.sourceIds.map((v) => ({ id: v, children: [] })));
  }, []);

  const startEvent = useCallback((id: ScraperEvent<"start">) => {
    const lastIdTmp = lastId.current;
    setSources((s) => {
      if (s[id]) s[id].status = "pending";
      if (lastIdTmp && s[lastIdTmp] && s[lastIdTmp].status === "pending")
        s[lastIdTmp].status = "success";
      return { ...s };
    });
    setCurrentSource(id);
    lastId.current = id;
  }, []);

  const updateEvent = useCallback((evt: ScraperEvent<"update">) => {
    setSources((s) => {
      if (s[evt.id]) {
        s[evt.id].status = evt.status;
        s[evt.id].reason = evt.reason;
        s[evt.id].error = evt.error;
        s[evt.id].percentage = evt.percentage;
      }
      return { ...s };
    });
  }, []);

  const discoverEmbedsEvent = useCallback(
    (evt: ScraperEvent<"discoverEmbeds">) => {
      setSources((s) => {
        evt.embeds.forEach((v) => {
          const source = getCachedMetadata().find(
            (src) => src.id === v.embedScraperId,
          );
          const out: ScrapingSegment = {
            embedId: v.embedScraperId,
            name: source?.name ?? v.embedScraperId,
            id: v.id,
            status: "waiting",
            percentage: 0,
          };
          s[v.id] = out;
        });
        return { ...s };
      });
      setSourceOrder((s) => {
        const source = s.find((v) => v.id === evt.sourceId);
        if (!source) return s;
        source.children = evt.embeds.map((v) => v.id);
        return [...s];
      });
    },
    [],
  );

  const startScrape = useCallback(() => {
    lastId.current = null;
  }, []);

  const getResult = useCallback((output: RunOutput | null) => {
    if (output && lastId.current) {
      setSources((s) => {
        if (!lastId.current) return s;
        if (s[lastId.current]) s[lastId.current].status = "success";
        return { ...s };
      });
    }
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

  const startScraping = useCallback(
    async (media: ScrapeMedia, startFromSourceId?: string) => {
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
      let baseSourceOrder = allSources.map((source) => source.id);

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

      // Prefer the source that worked for this title; fall back to last global.
      // Always apply the same pin for full scrapes AND Find-next/resume slices so
      // resume walks the same ordered list that produced the current source.
      if (enableLastSuccessfulSource) {
        const prioritizeSource = getPreferredSourceForTitle(
          preferredSourceByTitle,
          media.tmdbId,
          lastSuccessfulSource,
        );
        if (prioritizeSource) {
          const lastSourceIndex = baseSourceOrder.indexOf(prioritizeSource);
          if (lastSourceIndex !== -1) {
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
        (id) => !failedSources.includes(id)
      );

      // Collect all failed embed IDs across all sources for current media
      const allFailedEmbedIds = Object.values(failedEmbeds).flat();

      // Filter out failed embeds from the embed order
      const filteredEmbedOrder = enableEmbedOrder
        ? (preferredEmbedOrder || []).filter(
            (id) => !allFailedEmbedIds.includes(id),
          )
        : undefined;

      const minimumResolutionScore =
        minimumResolutionThreshold[preferredMinimumResolution] ?? 0;

      startScrape();
      const providers = getProviders();

      if (minimumResolutionScore <= 0) {
        const output = await providers.runAll({
          media,
          sourceOrder: filteredSourceOrder,
          embedOrder: filteredEmbedOrder,
          events: {
            init: initEvent,
            start: startEvent,
            update: updateEvent,
            discoverEmbeds: discoverEmbedsEvent,
          },
        });
        if (output && isExtensionActiveCached())
          await prepareStream(output.stream);
        return getResult(output);
      }

      let remainingSourceOrder = [...filteredSourceOrder];
      let bestFallbackOutput: RunOutput | null = null;
      let bestFallbackScore = -1;

      while (remainingSourceOrder.length > 0) {
        const output = await providers.runAll({
          media,
          sourceOrder: remainingSourceOrder,
          embedOrder: filteredEmbedOrder,
          events: {
            init: initEvent,
            start: startEvent,
            update: updateEvent,
            discoverEmbeds: discoverEmbedsEvent,
          },
        });

        if (!output) break;

        const sourceScore = getRunOutputBestResolutionScore(output);
        if (sourceScore > bestFallbackScore) {
          bestFallbackScore = sourceScore;
          bestFallbackOutput = output;
        }

        if (sourceScore >= minimumResolutionScore) {
          if (isExtensionActiveCached()) await prepareStream(output.stream);
          return getResult(output);
        }

        const currentSourceIndex = remainingSourceOrder.indexOf(output.sourceId);
        if (currentSourceIndex === -1) break;
        remainingSourceOrder = remainingSourceOrder.slice(currentSourceIndex + 1);
      }

      if (bestFallbackOutput && isExtensionActiveCached()) {
        await prepareStream(bestFallbackOutput.stream);
      }
      return getResult(bestFallbackOutput);
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

export function useListCenter(
  containerRef: RefObject<HTMLDivElement | null>,
  listRef: RefObject<HTMLDivElement | null>,
  sourceOrder: ScrapingItems[],
  currentSource: string | undefined,
) {
  const [renderedOnce, setRenderedOnce] = useState(false);

  const updatePosition = useCallback(() => {
    if (!containerRef.current) return;
    if (!listRef.current) return;

    const elements = [
      ...listRef.current.querySelectorAll("div[data-source-id]"),
    ] as HTMLDivElement[];

    const currentIndex = elements.findIndex(
      (e) => e.getAttribute("data-source-id") === currentSource,
    );

    const currentElement = elements[currentIndex];

    if (!currentElement) return;

    const containerWidth = containerRef.current.getBoundingClientRect().width;
    const listWidth = listRef.current.getBoundingClientRect().width;

    const containerHeight = containerRef.current.getBoundingClientRect().height;

    const listTop = listRef.current.getBoundingClientRect().top;

    const currentTop = currentElement.getBoundingClientRect().top;
    const currentHeight = currentElement.getBoundingClientRect().height;

    const topDifference = currentTop - listTop;

    const listNewLeft = containerWidth / 2 - listWidth / 2;
    const listNewTop = containerHeight / 2 - topDifference - currentHeight / 2;

    listRef.current.style.transform = `translateY(${listNewTop}px) translateX(${listNewLeft}px)`;
    setTimeout(() => {
      setRenderedOnce(true);
    }, 150);
  }, [currentSource, containerRef, listRef, setRenderedOnce]);

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

  return renderedOnce;
}
