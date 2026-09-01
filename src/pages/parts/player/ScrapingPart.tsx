import { ProviderControls, ScrapeMedia } from "@p-stream/providers";
import classNames from "classnames";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useMountedState } from "react-use";
import type { AsyncReturnType } from "type-fest";

import {
  scrapePartsToProviderMetric,
  useReportProviders,
} from "@/backend/helpers/report";
import { Button } from "@/components/buttons/Button";
import { Loading } from "@/components/layout/Loading";
import {
  ScrapeCard,
  ScrapeItem,
} from "@/components/player/internals/ScrapeCard";
import { foldSingleEmbed } from "@/hooks/scrapeEvents";
import {
  ScrapingItems,
  ScrapingSegment,
  useListCenter,
  useScrape,
} from "@/hooks/useProviderScrape";
import { resolveSourceDisplayName } from "@/utils/media/sourceDisplayName";
import {
  playerStatus,
  resolveFailedSourceMediaKey,
} from "@/stores/player/slices/source";
import { usePlayerStore } from "@/stores/player/store";

export interface ScrapingProps {
  media: ScrapeMedia;
  onGetStream?: (stream: AsyncReturnType<ProviderControls["runAll"]>) => void;
  onResult?: (
    sources: Record<string, ScrapingSegment>,
    sourceOrder: ScrapingItems[],
  ) => void;
  startFromSourceId?: string;
  /** Hide the full source carousel on automatic retries (wrong runtime, playback recovery). */
  compact?: boolean;
  /** 1-based playback recovery attempt (when compact). */
  retryAttempt?: number;
  maxRetries?: number;
}

/**
 * Sources race in parallel, so several are genuinely searching at once. Keep
 * every running one fully visible instead of spotlighting a single "current"
 * source and dimming its equally-busy neighbours.
 */
function statusOpacity(status: ScrapingSegment["status"] | undefined): number {
  if (status === "pending" || status === "success") return 1;
  if (status === "notfound" || status === "failure") return 0.6;
  return 0.35; // queued, not started yet
}

/**
 * Sources that came up empty sink below the ones still working, so the list
 * always reads top-down as "searching now" before "already ruled out".
 */
function statusRank(status: ScrapingSegment["status"] | undefined): number {
  if (status === "pending") return 0;
  if (status === "success") return 1;
  if (status === "notfound" || status === "failure") return 3;
  return 2; // queued, not started yet
}

export function ScrapingPart(props: ScrapingProps) {
  const { report } = useReportProviders();
  const { startScraping, resumeScraping, sourceOrder, sources, currentSource } =
    useScrape();
  const isMounted = useMountedState();
  const { t } = useTranslation();
  const addFailedSource = usePlayerStore((s) => s.addFailedSource);
  const sourceId = usePlayerStore((s) => s.sourceId);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const cards = useMemo(() => {
    const built = sourceOrder.flatMap((order) => {
      const parent = sources[order.id];
      if (!parent) return [];
      const embeds = order.children
        .map((id) => sources[id])
        .filter((embed): embed is ScrapingSegment => Boolean(embed));
      return [
        {
          order,
          // One embed reads as the source itself, so only list them when the
          // source really did fan out.
          embeds: embeds.length > 1 ? embeds : [],
          segment: foldSingleEmbed(parent, embeds),
        },
      ];
    });
    // Array.prototype.sort is stable, so sources keep their scrape order within
    // a status band.
    return built.sort(
      (a, b) => statusRank(a.segment.status) - statusRank(b.segment.status),
    );
  }, [sourceOrder, sources]);

  const displayOrder = useMemo(() => cards.map((card) => card.order), [cards]);

  const compactStatusText = useMemo(() => {
    if (!props.compact) return null;
    const attempt = props.retryAttempt ?? 0;
    const max = props.maxRetries ?? 0;
    const pendingSource = sourceOrder.find((order) => {
      const segment = sources[order.id];
      return segment?.status === "pending";
    });
    const sourceLabel = pendingSource
      ? resolveSourceDisplayName(
          pendingSource.id,
          sources[pendingSource.id]?.name,
        )
      : currentSource
        ? resolveSourceDisplayName(
            currentSource,
            sources[currentSource]?.name,
          )
        : null;
    if (attempt > 0 && max > 0 && sourceLabel) {
      return t("player.scraping.retryNextSourceProgress", {
        attempt,
        max,
        source: sourceLabel,
      });
    }
    if (attempt > 0 && max > 0) {
      return t("player.scraping.retryNextSourceAttempt", { attempt, max });
    }
    return t("player.scraping.retryNextSource");
  }, [
    props.compact,
    props.retryAttempt,
    props.maxRetries,
    sourceOrder,
    sources,
    currentSource,
    t,
  ]);

  const renderedOnce = useListCenter(containerRef, listRef, displayOrder);

  const resultRef = useRef({
    sourceOrder,
    sources,
  });
  useEffect(() => {
    resultRef.current = {
      sourceOrder,
      sources,
    };
  }, [sourceOrder, sources]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      let output = props.startFromSourceId
        ? await resumeScraping(props.media, props.startFromSourceId)
        : await startScraping(props.media);

      // First scrape after a cold open often races waking proxies and returns
      // null even though sources exist. One automatic retry covers most of it.
      if (!output && !props.startFromSourceId && isMounted() && !cancelled) {
        const { ensureSameOriginProxiesWarm } = await import(
          "@/backend/providers/providers"
        );
        await ensureSameOriginProxiesWarm(2500, true);
        await new Promise<void>((r) => {
          window.setTimeout(r, 800);
        });
        if (!isMounted() || cancelled) return;
        output = await startScraping(props.media);
      }

      // Do not fall back to a full scrape after a playback retry — that used to
      // re-run every provider (including ones already marked failed) and loop
      // on dead sources like Nova. Resume exhaustion should surface not-found.

      if (!isMounted() || cancelled) return;
      props.onResult?.(
        resultRef.current.sources,
        resultRef.current.sourceOrder,
      );
      report(
        scrapePartsToProviderMetric(
          props.media,
          resultRef.current.sourceOrder,
          resultRef.current.sources,
        ),
      );
      props.onGetStream?.(output);
    })().catch((error) => {
      if (!isMounted() || cancelled) return;
      const mediaKey = resolveFailedSourceMediaKey(
        usePlayerStore.getState().meta,
        props.media,
      );
      // Treat scraping failure as fatal error
      // Mark current source as failed if we have one
      const failedId = sourceId || currentSource;
      if (failedId) {
        addFailedSource(failedId, mediaKey ?? undefined);
      }
      // Set error and status to trigger PlaybackErrorPart
      usePlayerStore.setState((s) => {
        s.interface.error = {
          errorName: "ScrapingError",
          message: error?.message || "Failed to start scraping",
          type: "global",
        };
        s.status = playerStatus.PLAYBACK_ERROR;
      });
    });

    return () => {
      cancelled = true;
    };
    // currentSource/sourceId change as the race runs — do not re-fire scrape.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startScraping, resumeScraping, props.startFromSourceId, props.media]);

  return (
    <div
      className="h-full w-full relative dir-neutral:origin-top-left flex"
      ref={containerRef}
    >
      {props.compact ? (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center flex flex-col justify-center z-0">
          <Loading className="mb-8" />
          <p>{compactStatusText}</p>
        </div>
      ) : null}
      {!props.compact && (!sourceOrder || sourceOrder.length === 0) ? (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center flex flex-col justify-center z-0">
          <Loading className="mb-8" />
          <p>{t("player.scraping.items.pending")}</p>
        </div>
      ) : null}
      <div
        className={classNames({
          "absolute transition-[transform,opacity] opacity-0 dir-neutral:left-0": true,
          "!opacity-100": renderedOnce,
          hidden: props.compact,
        })}
        ref={listRef}
      >
        {cards.map(({ order, segment, embeds }) => (
          <div
            className="transition-opacity duration-200"
            style={{ opacity: statusOpacity(segment.status) }}
            key={order.id}
          >
            <ScrapeCard
              id={order.id}
              name={segment.name}
              status={segment.status}
              hasChildren={embeds.length > 0}
              percentage={segment.percentage}
            >
              <div
                className={classNames({
                  "space-y-6 mt-8": embeds.length > 0,
                })}
              >
                {embeds.map((embed) => (
                  <ScrapeItem
                    id={embed.id}
                    name={embed.name}
                    status={embed.status}
                    percentage={embed.percentage}
                    key={embed.id}
                  />
                ))}
              </div>
            </ScrapeCard>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ScrapingPartInterruptButton() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="flex gap-3 pb-3">
      <Button
        theme="secondary"
        padding="md:px-17 p-3"
        className="mt-6"
        onClick={() => {
          try {
            usePlayerStore.getState().reset();
          } catch {
            // still leave
          }
          navigate("/", { replace: true });
        }}
      >
        {t("notFound.goHome")}
      </Button>
      <Button
        onClick={() => window.location.reload()}
        theme="purple"
        padding="md:px-17 p-3"
        className="mt-6"
      >
        {t("notFound.reloadButton")}
      </Button>
    </div>
  );
}
