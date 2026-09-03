import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { Icons } from "@/components/Icon";
import {
  PlayerStageIcon,
  PlayerStageOverlay,
} from "@/components/player/internals/PlayerStageOverlay";
import { useAnimatedEllipsis } from "@/components/player/internals/useAnimatedEllipsis";
import { ScrapingItems, ScrapingSegment } from "@/hooks/useProviderScrape";
import { resolveSourceDisplayName } from "@/utils/media/sourceDisplayName";

function labelForSource(
  sourceId: string | undefined,
  sources: Record<string, ScrapingSegment>,
): string | null {
  if (!sourceId) return null;
  const seg = sources[sourceId];
  if (!seg) return null;
  return resolveSourceDisplayName(sourceId, seg.name);
}

/** Prefer the sticky current source; fall back to any in-flight card. */
function stickyAskingLabel(
  activeSourceId: string | undefined,
  sourceOrder: ScrapingItems[],
  sources: Record<string, ScrapingSegment>,
): string | null {
  const active = labelForSource(activeSourceId, sources);
  if (active) return active;

  for (const order of sourceOrder) {
    const seg = sources[order.id];
    if (seg?.status === "pending" || seg?.status === "waiting") {
      return resolveSourceDisplayName(order.id, seg.name);
    }
    for (const childId of order.children) {
      const child = sources[childId];
      if (child?.status === "pending" || child?.status === "waiting") {
        return resolveSourceDisplayName(childId, child.name);
      }
    }
  }
  return null;
}

export interface UnifiedScrapingLoaderProps {
  poster?: string | null;
  title?: string;
  sourceOrder?: ScrapingItems[];
  sources?: Record<string, ScrapingSegment>;
  /** Sticky source id from the scrape runner — avoids rotating “asking …” labels. */
  activeSourceId?: string;
  /** Override the status line (e.g. metadata load). */
  statusKey?: string;
  className?: string;
}

export function UnifiedScrapingLoader({
  poster,
  title,
  sourceOrder = [],
  sources = {},
  activeSourceId,
  statusKey,
  className,
}: UnifiedScrapingLoaderProps) {
  const { t } = useTranslation();
  const ellipsis = useAnimatedEllipsis();

  const activeSource = useMemo(
    () => stickyAskingLabel(activeSourceId, sourceOrder, sources),
    [activeSourceId, sourceOrder, sources],
  );

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
