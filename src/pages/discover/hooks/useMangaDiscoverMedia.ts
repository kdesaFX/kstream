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

const ORDER: Record<MangaCarouselKind, MangaOrder> = {
  popular: "followedCount",
  topRated: "rating",
  latest: "latestUploadedChapter",
  recentlyAdded: "createdAt",
};

export function useMangaDiscoverMedia(kind: MangaCarouselKind, enabled: boolean) {
  const enableMatureTitles = usePreferencesStore((s) => s.enableMatureTitles);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    setError(null);
    try {
      const items = await listManga({ order: ORDER[kind], limit: 24 });
      setMedia(items.map(mangaToMediaItem));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load manga");
      setMedia([]);
    } finally {
      setIsLoading(false);
    }
  }, [kind, enabled, enableMatureTitles]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { media, isLoading, error, refetch };
}
