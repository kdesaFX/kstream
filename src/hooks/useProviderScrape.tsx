import {
  FullScraperEvents,
  NotFoundError,
  RunOutput,
  ScrapeMedia,
  SourcererOutput,
} from "@p-stream/providers";
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
import { resolveFailedSourceMediaKey } from "@/stores/player/slices/source";
import { usePlayerStore } from "@/stores/player/store";
import {
  getPreferredSourceForTitle,
  usePreferencesStore,
} from "@/stores/preferences";
import { isAnimeSourceId, isAnimeTitle } from "@/utils/media/anime";
import {
  CASTLETV_SOURCE_ID,
  excludeCastletvFromNonIndianAutoScrape,
  isIndianTitle,
  prioritizeIndianSources,
} from "@/utils/media/indianSources";
import { excludeDeferredFromPrimary } from "@/utils/media/regionalSources";
import {
  orderSourceIdsForPlayback,
  detectPlaybackEnv,
  excludeZeroHitFromAutoScrape,
  hasProvenZeroHit,
  prioritizeConfiguredSources,
} from "@/utils/media/sourceOrder";
import { resolveSourceDisplayName } from "@/utils/media/sourceDisplayName";

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

const WAY2_SOLO_SOURCE_ID = "way2movies";
const WAY2_SOLO_RETRY_DELAY_MS = 2000;
const CASTLE_SOLO_RETRY_DELAY_MS = 1500;

function sourcererToRunOutput(
  sourceId: string,
  result: SourcererOutput,
): RunOutput | null {
  const raw = result.stream;
  const streams = !raw ? [] : Array.isArray(raw) ? raw : [raw];
  if (!streams.length) return null;
  return {
    sourceId,
    stream: streams[0],
    streams,
  };
}

function shouldTryWay2SoloFirst(
  sourceOrder: string[],
  preferredSourceId: string | null,
): boolean {
  const index = sourceOrder.indexOf(WAY2_SOLO_SOURCE_ID);
  if (index === -1) return false;
  if (preferredSourceId === WAY2_SOLO_SOURCE_ID) return true;
  // Way2 needs ~15s and rate-limits under parallel bursts — give it a clean
  // solo attempt when it would race near the front anyway.
  return index < 2;
}

async function tryWay2moviesSoloFirst(opts: {
  providers: ReturnType<typeof getProviders>;
  media: ScrapeMedia;
  events: {
    start: (id: string) => void;
    update: (evt: ScraperEvent<"update">) => void;
  };
  sourceOrder: string[];
  preferredSourceId: string | null;
}): Promise<{ output: RunOutput | null; remainingOrder: string[] }> {
  const remainingOrder = opts.sourceOrder.filter(
    (id) => id !== WAY2_SOLO_SOURCE_ID,
  );
  if (!shouldTryWay2SoloFirst(opts.sourceOrder, opts.preferredSourceId)) {
    return { output: null, remainingOrder: opts.sourceOrder };
  }

  opts.events.start(WAY2_SOLO_SOURCE_ID);
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => {
        setTimeout(resolve, WAY2_SOLO_RETRY_DELAY_MS);
      });
    }
    try {
      const result = await opts.providers.runSourceScraper({
        id: WAY2_SOLO_SOURCE_ID,
        media: opts.media,
        events: opts.events,
      });
      const output = sourcererToRunOutput(WAY2_SOLO_SOURCE_ID, result);
      if (output) return { output, remainingOrder };
    } catch (err) {
      lastError = err;
    }
  }

  if (lastError) {
    const notFound = lastError instanceof NotFoundError;
    opts.events.update({
      id: WAY2_SOLO_SOURCE_ID,
      percentage: 100,
      status: notFound ? "notfound" : "failure",
      reason:
        lastError instanceof Error ? lastError.message : "Way2Movies failed",
      error: notFound ? undefined : (lastError as Error),
    });
  }

  return { output: null, remainingOrder };
}

function shouldTryCastleSoloFirst(
  sourceOrder: string[],
  meta: ReturnType<typeof usePlayerStore.getState>["meta"],
): boolean {
  if (!isIndianTitle(meta)) return false;
  return sourceOrder.includes(CASTLETV_SOURCE_ID);
}

async function tryCastleTvSoloFirst(opts: {
  providers: ReturnType<typeof getProviders>;
  media: ScrapeMedia;
  events: {
    start: (id: string) => void;
    update: (evt: ScraperEvent<"update">) => void;
  };
  sourceOrder: string[];
  meta: ReturnType<typeof usePlayerStore.getState>["meta"];
}): Promise<{ output: RunOutput | null; remainingOrder: string[] }> {
  const remainingOrder = opts.sourceOrder.filter(
    (id) => id !== CASTLETV_SOURCE_ID,
  );
  if (!shouldTryCastleSoloFirst(opts.sourceOrder, opts.meta)) {
    return { output: null, remainingOrder: opts.sourceOrder };
  }

  opts.events.start(CASTLETV_SOURCE_ID);
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => {
        setTimeout(resolve, CASTLE_SOLO_RETRY_DELAY_MS);
      });
    }
    try {
      const result = await opts.providers.runSourceScraper({
        id: CASTLETV_SOURCE_ID,
        media: opts.media,
        events: opts.events,
      });
      const output = sourcererToRunOutput(CASTLETV_SOURCE_ID, result);
      if (output) return { output, remainingOrder };
    } catch (err) {
      lastError = err;
    }
  }

  if (lastError) {
    const notFound = lastError instanceof NotFoundError;
    opts.events.update({
      id: CASTLETV_SOURCE_ID,
      percentage: 100,
      status: notFound ? "notfound" : "failure",
      reason:
        lastError instanceof Error ? lastError.message : "CastleTV failed",
      error: notFound ? undefined : (lastError as Error),
    });
  }

  return { output: null, remainingOrder };
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
            name: resolveSourceDisplayName(id, source?.name ?? id),
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
            name: resolveSourceDisplayName(v, source?.name ?? v),
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
            name: resolveSourceDisplayName(
              v.embedScraperId,
              source?.name ?? v.embedScraperId,
            ),
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
      const mediaKey = resolveFailedSourceMediaKey(playerState.meta, media);
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
      const sourceOrderCtx = {
        env: detectPlaybackEnv(),
        mediaType: media.type === "show" ? ("show" as const) : ("movie" as const),
        meta: playerState.meta,
      };
      baseSourceOrder = prioritizeConfiguredSources(
        orderSourceIdsForPlayback(baseSourceOrder, sourceOrderCtx),
        { hasDebridToken: Boolean(debridToken?.trim()) },
      );
      baseSourceOrder = prioritizeIndianSources(
        baseSourceOrder,
        playerState.meta,
      );
      baseSourceOrder = excludeCastletvFromNonIndianAutoScrape(
        baseSourceOrder,
        playerState.meta,
      );
      baseSourceOrder = excludeZeroHitFromAutoScrape(
        baseSourceOrder,
        sourceOrderCtx,
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
        if (
          prioritizeSource &&
          baseSourceOrder.includes(prioritizeSource) &&
          !hasProvenZeroHit(prioritizeSource, sourceOrderCtx)
        ) {
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

      const recordFailedSource = (sourceId: string) => {
        if (!mediaKey) return;
        usePlayerStore.getState().addFailedSource(sourceId, mediaKey);
      };

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
        const check = await validateRunOutput(output, sourceOrderCtx);
        if (check.ok) {
          const accepted = { ...output, stream: check.stream };
          if (isExtensionActiveCached()) await prepareStream(check.stream);
          return accepted;
        }
        markSourceRejected(output.sourceId, check.reason);
        // Remember every rejected hit for this episode so playback recovery
        // and the next scrape cannot walk back into the same dead stream.
        recordFailedSource(output.sourceId);
        return null;
      };

      startScrape();

      const preferredSourceId = enableLastSuccessfulSource
        ? getPreferredSourceForTitle(
            preferredSourceByTitle,
            media.tmdbId,
            lastSuccessfulSource,
          )
        : null;

      const trySoloWay2 = async (order: string[]) => {
        const solo = await tryWay2moviesSoloFirst({
          providers,
          media,
          events: runEvents,
          sourceOrder: order,
          preferredSourceId,
        });
        if (solo.output) {
          const accepted = await acceptValidatedOutput(solo.output);
          if (accepted) return { accepted, order: solo.remainingOrder };
        }
        return { accepted: null, order: solo.remainingOrder };
      };

      const trySoloCastle = async (order: string[]) => {
        const solo = await tryCastleTvSoloFirst({
          providers,
          media,
          events: runEvents,
          sourceOrder: order,
          meta: playerState.meta,
        });
        if (solo.output) {
          const accepted = await acceptValidatedOutput(solo.output);
          if (accepted) return { accepted, order: solo.remainingOrder };
        }
        return { accepted: null, order: solo.remainingOrder };
      };

      const runParallelScrape = async (order: string[]) => {
        let remainingSourceOrder = order;
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
      };

      // Playback resume landed past the last source, or every remaining source
      // was already marked failed. runAll never runs in that case, which used to
      // yield SOURCE ORDER (0) and a bogus "not found" with no providers tried.
      if (filteredSourceOrder.length === 0) {
        if (baseSourceOrder.length > 0) {
          initEvent({ sourceIds: baseSourceOrder });
          const resumeIndex = startFromSourceId
            ? baseSourceOrder.indexOf(startFromSourceId)
            : -1;
          for (let index = 0; index < baseSourceOrder.length; index++) {
            const id = baseSourceOrder[index]!;
            if (failedSources.includes(id)) {
              markSourceRejected(id, "Previously failed");
            } else if (resumeIndex !== -1 && index <= resumeIndex) {
              markSourceRejected(id, "Already tried");
            } else {
              markSourceRejected(id, "No sources left to try");
            }
          }
        }
        return getResult(null);
      }

      if (minimumResolutionScore <= 0) {
        const castleSolo = await trySoloCastle(filteredSourceOrder);
        if (castleSolo.accepted) return getResult(castleSolo.accepted);
        const soloFirst = await trySoloWay2(castleSolo.order);
        if (soloFirst.accepted) return getResult(soloFirst.accepted);
        return runParallelScrape(soloFirst.order);
      }

      const castleSolo = await trySoloCastle(filteredSourceOrder);
      if (castleSolo.accepted) return getResult(castleSolo.accepted);
      const soloFirst = await trySoloWay2(castleSolo.order);
      if (soloFirst.accepted) return getResult(soloFirst.accepted);
      let remainingSourceOrder = soloFirst.order;
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
        // Resolution-only misses are not dead streams — user may lower the floor
        // or the source may serve adaptive HLS that mis-reports file tiers.

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
