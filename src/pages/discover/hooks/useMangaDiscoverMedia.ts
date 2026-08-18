import { useCallback, useEffect, useState } from "react";

import {
  listManga,
  mangaToMediaItem,
  type MangaOrder,
} from "@/backend/manga/mangadex";
import { usePreferencesStore } from "@/stores/preferences";
import { MediaItem } from "@/utils/media/mediaTypes";

export type MangaCarouselKind =
  | "popular"
  | "topRated"
  | "latest"
  | "recentlyAdded";

const ORDER: Record<
  "popular" | "topRated" | "latest" | "recentlyAdded",
  MangaOrder
> = {
  popular: "followedCount",
  topRated: "rating",
  latest: "latestUploadedChapter",
  recentlyAdded: "createdAt",
};

export function mangaDiscoverQuery(
  kind: MangaCarouselKind,
  genreId?: string | null,
) {
  return {
    order: ORDER[kind],
    includedTags: genreId ? [genreId] : undefined,
  };
}

export function useMangaDiscoverMedia(
  kind: MangaCarouselKind,
  enabled: boolean,
  genreId?: string | null,
) {
  const enableMatureTitles = usePreferencesStore((s) => s.enableMatureTitles);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    setHasLoaded(false);
    setMedia([]);
    setError(null);
    try {
      const query = mangaDiscoverQuery(kind, genreId);
      const items = await listManga({
        order: query.order,
        limit: 24,
        includeStats: false,
        includedTags: query.includedTags,
      });
      setMedia(items.map(mangaToMediaItem));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load manga");
      setMedia([]);
    } finally {
      setIsLoading(false);
      setHasLoaded(true);
    }
  }, [kind, enabled, genreId, enableMatureTitles]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { media, isLoading, hasLoaded, error, refetch };
}
