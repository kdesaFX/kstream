import { ProviderControls, ScrapeMedia } from "@p-stream/providers";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useMountedState } from "react-use";
import type { AsyncReturnType } from "type-fest";

import {
  scrapePartsToProviderMetric,
  useReportProviders,
} from "@/backend/helpers/report";
import { Button } from "@/components/buttons/Button";
import { UnifiedScrapingLoader } from "@/components/player/internals/UnifiedScrapingLoader";
import {
  ScrapingItems,
  ScrapingSegment,
  useScrape,
} from "@/hooks/useProviderScrape";
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
}

export function ScrapingPart(props: ScrapingProps) {
  const { report } = useReportProviders();
  const { startScraping, resumeScraping, sourceOrder, sources, currentSource } =
    useScrape();
  const isMounted = useMountedState();
  const addFailedSource = usePlayerStore((s) => s.addFailedSource);
  const sourceId = usePlayerStore((s) => s.sourceId);
  const meta = usePlayerStore((s) => s.meta);

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
      const failedId = sourceId;
      if (failedId) {
        addFailedSource(failedId, mediaKey ?? undefined);
      }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startScraping, resumeScraping, props.startFromSourceId, props.media]);

  const displayTitle =
    meta?.type === "show" && meta.episode
      ? `${meta.title} · S${meta.season?.number ?? 1}E${meta.episode.number}`
      : meta?.title;

  return (
    <div className="h-full w-full relative">
      <UnifiedScrapingLoader
        poster={meta?.poster}
        title={displayTitle}
        sourceOrder={sourceOrder}
        sources={sources}
        activeSourceId={currentSource}
      />
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
