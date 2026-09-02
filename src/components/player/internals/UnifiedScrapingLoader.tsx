import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Icons } from "@/components/Icon";
import {
  PlayerStageIcon,
  PlayerStageOverlay,
} from "@/components/player/internals/PlayerStageOverlay";
import { ScrapingItems, ScrapingSegment } from "@/hooks/useProviderScrape";
import { resolveSourceDisplayName } from "@/utils/media/sourceDisplayName";

function useAnimatedEllipsis(intervalMs = 450) {
  const [dotCount, setDotCount] = useState(1);

  useEffect(() => {
    const id = window.setInterval(() => {
      setDotCount((count) => (count % 3) + 1);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return ` ${". ".repeat(dotCount).trimEnd()}`;
}

function pendingSourceLabels(
  sourceOrder: ScrapingItems[],
  sources: Record<string, ScrapingSegment>,
): string[] {
  return sourceOrder
    .filter((order) => sources[order.id]?.status === "pending")
    .map((order) =>
      resolveSourceDisplayName(order.id, sources[order.id]?.name),
    );
}

export interface UnifiedScrapingLoaderProps {
  poster?: string | null;
  title?: string;
  sourceOrder?: ScrapingItems[];
  sources?: Record<string, ScrapingSegment>;
  /** Override the status line (e.g. metadata load). */
  statusKey?: string;
  className?: string;
}

export function UnifiedScrapingLoader({
  poster,
  title,
  sourceOrder = [],
  sources = {},
  statusKey,
  className,
}: UnifiedScrapingLoaderProps) {
  const { t } = useTranslation();
  const ellipsis = useAnimatedEllipsis();

  const pendingLabels = useMemo(
    () => pendingSourceLabels(sourceOrder, sources),
    [sourceOrder, sources],
  );

  const [rotateIndex, setRotateIndex] = useState(0);

  useEffect(() => {
    setRotateIndex(0);
  }, [pendingLabels.join("|")]);

  useEffect(() => {
    if (pendingLabels.length <= 1) return undefined;
    const id = window.setInterval(() => {
      setRotateIndex((index) => (index + 1) % pendingLabels.length);
    }, 2400);
    return () => window.clearInterval(id);
  }, [pendingLabels.length]);

  const activeSource =
    pendingLabels[rotateIndex] ?? pendingLabels[0] ?? null;

  const statusLine = statusKey
    ? t(statusKey)
    : activeSource
      ? t("player.scraping.unified.asking", { source: activeSource })
      : sourceOrder.length > 0
        ? t("player.scraping.unified.searching")
        : t("player.scraping.unified.starting");

  return (
    <PlayerStageOverlay poster={poster} className={className}>
      <PlayerStageIcon icon={Icons.CLAPPER_BOARD} />
      <h2 className="text-2xl font-semibold tracking-tight text-white">
        {statusLine}
        <span className="inline-block min-w-[1.5rem] text-left">{ellipsis}</span>
      </h2>
      {title ? (
        <p className="mt-3 line-clamp-2 text-sm text-white/50">{title}</p>
      ) : null}
    </PlayerStageOverlay>
  );
}
