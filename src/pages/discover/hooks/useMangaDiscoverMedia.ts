import { useCallback, useEffect, useState } from "react";

import { MANGA_GENRE_TAGS, type MangaGenreTagKey } from "@/backend/manga/mangaTags";
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
  | "recentlyAdded"
  | MangaGenreTagKey;

const ORDER: Record<
  "popular" | "topRated" | "latest" | "recentlyAdded",
  MangaOrder
> = {
  popular: "followedCount",
  topRated: "rating",
  latest: "latestUploadedChapter",
  recentlyAdded: "createdAt",
};

function isGenreKind(
  kind: MangaCarouselKind,
): kind is MangaGenreTagKey {
  return kind in MANGA_GENRE_TAGS;
}

export function useMangaDiscoverMedia(
  kind: MangaCarouselKind,
  enabled: boolean,
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
      const includedTags = isGenreKind(kind)
        ? [MANGA_GENRE_TAGS[kind]]
        : undefined;
      const order = isGenreKind(kind) ? "followedCount" : ORDER[kind];
      const items = await listManga({
        order,
        limit: 24,
        includeStats: false,
        includedTags,
      });
      setMedia(items.map(mangaToMediaItem));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load manga");
      setMedia([]);
    } finally {
      setIsLoading(false);
      setHasLoaded(true);
    }
  }, [kind, enabled, enableMatureTitles]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { media, isLoading, hasLoaded, error, refetch };
}
