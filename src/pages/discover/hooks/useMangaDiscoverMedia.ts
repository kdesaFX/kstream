import { useCallback, useEffect, useState } from "react";

import {
  discoverMangaToMediaItem,
  listDiscoverManga,
} from "@/backend/manga/discoverCatalog";
import type { MangaGenreTagKey } from "@/backend/manga/mangaTags";
import { usePreferencesStore } from "@/stores/preferences";
import { MediaItem } from "@/utils/media/mediaTypes";

export type MangaCarouselKind =
  | "popular"
  | "topRated"
  | "latest"
  | "recentlyAdded"
  | MangaGenreTagKey;

export function useMangaDiscoverMedia(
  kind: MangaCarouselKind,
  enabled: boolean,
  tagFilter?: MangaGenreTagKey,
) {
  const enableMatureTitles = usePreferencesStore((s) => s.enableMatureTitles);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    setError(null);
    try {
      const items = await listDiscoverManga({
        kind,
        limit: 24,
        tagFilter,
      });
      setMedia(items.map(discoverMangaToMediaItem));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load manga");
      setMedia([]);
    } finally {
      setIsLoading(false);
      setHasLoaded(true);
    }
  }, [kind, enabled, enableMatureTitles, tagFilter]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { media, isLoading, hasLoaded, error, refetch };
}
