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
import {
  ScrapingItems,
  ScrapingSegment,
  useListCenter,
  useScrape,
} from "@/hooks/useProviderScrape";
import { playerStatus } from "@/stores/player/slices/source";
import { usePlayerStore } from "@/stores/player/store";

export interface ScrapingProps {
  media: ScrapeMedia;
  onGetStream?: (stream: AsyncReturnType<ProviderControls["runAll"]>) => void;
  onResult?: (
    sources: Record<string, ScrapingSegment>,
    sourceOrder: ScrapingItems[],
  ) => void;
  startFromSourceId?: string;
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

  // Array.prototype.sort is stable, so sources keep their scrape order within
  // a status band.
  const displayOrder = useMemo(
    () =>
      [...sourceOrder].sort(
        (a, b) =>
          statusRank(sources[a.id]?.status) - statusRank(sources[b.id]?.status),
      ),
    [sourceOrder, sources],
  );

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

  const started = useRef<string | null>(null);
  useEffect(() => {
    // Only start scraping if we haven't started with this startFromSourceId before
    const currentKey = props.startFromSourceId || "default";
    if (started.current === currentKey) return;
    started.current = currentKey;

    (async () => {
      const output = props.startFromSourceId
        ? await resumeScraping(props.media, props.startFromSourceId)
        : await startScraping(props.media);
      if (!isMounted()) return;
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
      if (!isMounted()) return;
      // Treat scraping failure as fatal error
      // Mark current source as failed if we have one
      const failedId = sourceId || currentSource;
      if (failedId) {
        addFailedSource(failedId);
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
    // currentSource/sourceId change as the race runs — do not re-fire scrape.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startScraping, resumeScraping, props.startFromSourceId, props.media]);

  return (
    <div
      className="h-full w-full relative dir-neutral:origin-top-left flex"
      ref={containerRef}
    >
      {!sourceOrder || sourceOrder.length === 0 ? (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center flex flex-col justify-center z-0">
          <Loading className="mb-8" />
          <p>{t("player.scraping.items.pending")}</p>
        </div>
      ) : null}
      <div
        className={classNames({
          "absolute transition-[transform,opacity] opacity-0 dir-neutral:left-0": true,
          "!opacity-100": renderedOnce,
        })}
        ref={listRef}
      >
        {displayOrder.map((order) => {
          const source = sources[order.id];
          return (
            <div
              className="transition-opacity duration-200"
              style={{ opacity: statusOpacity(source.status) }}
              key={order.id}
            >
              <ScrapeCard
                id={order.id}
                name={source.name}
                status={source.status}
                hasChildren={order.children.length > 0}
                percentage={source.percentage}
              >
                <div
                  className={classNames({
                    "space-y-6 mt-8": order.children.length > 0,
                  })}
                >
                  {order.children.map((embedId) => {
                    const embed = sources[embedId];
                    return (
                      <ScrapeItem
                        id={embedId}
                        name={embed.name}
                        status={embed.status}
                        percentage={embed.percentage}
                        key={embedId}
                      />
                    );
                  })}
                </div>
              </ScrapeCard>
            </div>
          );
        })}
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
