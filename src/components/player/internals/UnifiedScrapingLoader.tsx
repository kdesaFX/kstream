import classNames from "classnames";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Icon, Icons } from "@/components/Icon";
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
  sourceOrder: ScrapingItems[];
  sources: Record<string, ScrapingSegment>;
  className?: string;
}

export function UnifiedScrapingLoader({
  poster,
  title,
  sourceOrder,
  sources,
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

  const statusLine = activeSource
    ? t("player.scraping.unified.asking", { source: activeSource })
    : sourceOrder.length > 0
      ? t("player.scraping.unified.searching")
      : t("player.scraping.unified.starting");

  return (
    <div
      className={classNames(
        "absolute inset-0 z-0 flex items-center justify-center overflow-hidden",
        className,
      )}
    >
      {poster ? (
        <img
          src={poster}
          alt=""
          className="absolute inset-0 h-full w-full object-cover scale-105 blur-md opacity-30"
          aria-hidden
        />
      ) : null}
      <div
        className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/80 to-black/90"
        aria-hidden
      />

      <div className="relative z-10 flex max-w-md flex-col items-center px-8 text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm">
          <Icon icon={Icons.CLAPPER_BOARD} className="text-5xl text-white" />
        </div>
        <h2 className="text-2xl font-semibold tracking-tight text-white">
          {statusLine}
          <span className="inline-block min-w-[1.5rem] text-left">{ellipsis}</span>
        </h2>
        {title ? (
          <p className="mt-3 text-sm text-white/50 line-clamp-2">{title}</p>
        ) : null}
      </div>
    </div>
  );
}
