import { useEffect, useState } from "react";

import { getUsContentRating } from "@/backend/metadata/tmdbMaturity";
import type { MediaItem } from "@/utils/media/mediaTypes";

export function useCardContentRating(
  media: MediaItem,
  enabled: boolean,
): string | null {
  const [contentRating, setContentRating] = useState(
    media.contentRating ?? null,
  );

  useEffect(() => {
    setContentRating(media.contentRating ?? null);
  }, [media.contentRating, media.id]);

  useEffect(() => {
    if (!enabled || contentRating || media.type === "manga") return undefined;

    const id = Number(media.id);
    if (!Number.isFinite(id)) return undefined;

    let cancelled = false;
    void getUsContentRating(id, media.type).then((rating) => {
      if (!cancelled && rating) setContentRating(rating);
    });

    return () => {
      cancelled = true;
    };
  }, [contentRating, enabled, media.id, media.type]);

  return contentRating;
}
