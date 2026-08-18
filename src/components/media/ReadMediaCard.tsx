import { useMemo } from "react";

import { chapterBadge } from "@/backend/manga/mangadex";
import {
  shouldShowMangaProgress,
  useMangaProgressStore,
} from "@/stores/mangaProgress";
import type { MediaItem } from "@/utils/media/mediaTypes";

import { MediaCard } from "./MediaCard";

export interface ReadMediaCardProps {
  media: MediaItem;
  closable?: boolean;
  onClose?: () => void;
  onShowDetails?: (media: MediaItem) => void;
}

export function ReadMediaCard(props: ReadMediaCardProps) {
  const progressItems = useMangaProgressStore((s) => s.items);
  const item = useMemo(
    () => progressItems[props.media.id],
    [progressItems, props.media.id],
  );

  const show = item ? shouldShowMangaProgress(item) : false;
  const percentage =
    show && item.totalPages > 0
      ? Math.round(((item.page + 1) / item.totalPages) * 100)
      : undefined;

  return (
    <MediaCard
      media={props.media}
      linkable
      percentage={percentage}
      badge={item ? chapterBadge(item.chapterLabel) : undefined}
      closable={props.closable}
      onClose={props.onClose}
      onShowDetails={props.onShowDetails}
    />
  );
}
