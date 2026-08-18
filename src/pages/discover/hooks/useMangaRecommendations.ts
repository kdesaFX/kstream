import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { fetchMangaRecommendations } from "@/backend/manga/mangaRecommendations";
import { usePreferencesStore } from "@/stores/preferences";
import type { MediaItem } from "@/utils/media/mediaTypes";

export function useMangaRecommendations(
  seedId: string | undefined,
  seedTitle: string | undefined,
  seedTags: Array<{ id: string; name: string }> | undefined,
  enabled: boolean,
) {
  const enableMatureTitles = usePreferencesStore((s) => s.enableMatureTitles);
  const { t } = useTranslation();
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sectionTitle, setSectionTitle] = useState("");

  const refetch = useCallback(async () => {
    if (!enabled || !seedId || !seedTitle) return;
    setIsLoading(true);
    setError(null);
    setSectionTitle(
      t("discover.carousel.title.manga.recommended", { title: seedTitle }),
    );
    try {
      const items = await fetchMangaRecommendations({
        seedId,
        seedTitle,
        seedTags,
      });
      setMedia(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load recommendations");
      setMedia([]);
    } finally {
      setIsLoading(false);
      setHasLoaded(true);
    }
  }, [enabled, seedId, seedTitle, seedTags, enableMatureTitles, t]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { media, isLoading, hasLoaded, error, sectionTitle, refetch };
}
