import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { searchManga } from "@/backend/manga/catalog";
import { mangaToMediaItem } from "@/backend/manga/mangadex";
import { searchForMedia } from "@/backend/metadata/search";
import { MWQuery } from "@/backend/metadata/types/mw";
import { IconPatch } from "@/components/buttons/IconPatch";
import { Icons } from "@/components/Icon";
import { MediaGrid } from "@/components/media/MediaGrid";
import { WatchedMediaCard } from "@/components/media/WatchedMediaCard";
import { useDebounce } from "@/hooks/useDebounce";
import { Button } from "@/pages/About";
import {
  SearchCategory,
  SearchCategoryTabs,
} from "@/pages/parts/search/SearchCategoryTabs";
import { SearchLoadingPart } from "@/pages/parts/search/SearchLoadingPart";
import { HomeAd } from "@/pages/parts/home/HomeAd";
import { useOverlayStack } from "@/stores/interface/overlayStack";
import { usePreferencesStore } from "@/stores/preferences";
import { MediaItem } from "@/utils/media/mediaTypes";

function SearchSuffix(props: { failed?: boolean; results?: number }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const icon: Icons = props.failed ? Icons.WARNING : Icons.EYE_SLASH;

  return (
    <div className="mt-40 flex flex-col items-center justify-center space-y-3 text-center">
      <IconPatch
        icon={icon}
        className={`text-xl ${
          props.failed ? "text-red-400" : "text-type-logo"
        }`}
      />

      {!props.failed ? (
        <div>
          {(props.results ?? 0) > 0 ? (
            <>
              <p>{t("home.search.allResults")}</p>
              <Button
                className="px-py p-[0.3em] mt-3 rounded-xl text-type-dimmed box-content text-[17px] bg-largeCard-background justify-center items-center"
                onClick={() => navigate("/")}
              >
                {t("home.search.discoverMore")}
              </Button>
            </>
          ) : (
            <p>{t("home.search.noResults")}</p>
          )}
        </div>
      ) : null}

      {props.failed ? (
        <div>
          <p>{t("home.search.failed")}</p>
        </div>
      ) : null}
    </div>
  );
}

export function SearchListPart({
  searchQuery,
  onShowDetails,
}: {
  searchQuery: string;
  onShowDetails?: (media: MediaItem) => void;
}) {
  const { t } = useTranslation();
  const { showModal } = useOverlayStack();
  const enableMangaDiscover = usePreferencesStore((s) => s.enableMangaDiscover);

  const [results, setResults] = useState<MediaItem[]>([]);
  const [mangaResults, setMangaResults] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [activeTab, setActiveTab] = useState<SearchCategory>("watch");
  const requestIdRef = useRef(0);
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  useEffect(() => {
    setActiveTab("watch");
  }, [debouncedSearchQuery]);

  useEffect(() => {
    if (results.length === 0 && mangaResults.length > 0) {
      setActiveTab("manga");
    } else if (results.length > 0 && mangaResults.length === 0) {
      setActiveTab("watch");
    }
  }, [results.length, mangaResults.length]);

  useEffect(() => {
    async function runSearch(query: MWQuery, requestId: number) {
      setLoading(true);
      setFailed(false);

      let nextResults: MediaItem[] = [];
      let nextManga: MediaItem[] = [];
      let didFail = false;

      const movieTv = searchForMedia(query)
        .then((r) => r ?? [])
        .catch(() => {
          didFail = true;
          return [] as MediaItem[];
        });
      const manga = enableMangaDiscover
        ? searchManga(query.searchQuery)
            .then((items) => items.map(mangaToMediaItem))
            .catch(() => [] as MediaItem[])
        : Promise.resolve([] as MediaItem[]);

      const [a, b] = await Promise.all([movieTv, manga]);
      nextResults = a;
      nextManga = b;

      if (requestIdRef.current !== requestId) return;

      setFailed(didFail && nextManga.length === 0 && nextResults.length === 0);
      setResults(nextResults);
      setMangaResults(nextManga);
      setLoading(false);
    }

    if (debouncedSearchQuery === "") {
      setResults([]);
      setMangaResults([]);
      setLoading(false);
      setFailed(false);
      return;
    }

    requestIdRef.current += 1;
    runSearch({ searchQuery: debouncedSearchQuery }, requestIdRef.current);
  }, [debouncedSearchQuery, enableMangaDiscover]);

  const handleMangaDetails = (media: MediaItem) => {
    if (onShowDetails) {
      onShowDetails(media);
      return;
    }
    showModal("manga-details", {
      id: media.id,
      mangaId: media.id,
      type: "manga",
    });
  };

  if (loading) return <SearchLoadingPart />;
  if (failed) return <SearchSuffix failed />;

  const total = results.length + mangaResults.length;
  if (total === 0) return <SearchSuffix results={0} />;

  const showMangaTab = enableMangaDiscover;
  const showTabs = showMangaTab && total > 0;
  const visibleItems = activeTab === "manga" ? mangaResults : results;
  const emptyActiveTab =
    activeTab === "manga"
      ? mangaResults.length === 0
      : results.length === 0;

  return (
    <div className="space-y-8">
      {showTabs ? (
        <SearchCategoryTabs
          active={activeTab}
          onChange={setActiveTab}
          showManga={showMangaTab}
        />
      ) : null}

      <HomeAd slot="search" />

      {emptyActiveTab ? (
        <p className="text-center text-type-secondary">
          {t("home.search.noResults")}
        </p>
      ) : (
        <MediaGrid>
          {visibleItems.map((v) => (
            <WatchedMediaCard
              key={activeTab === "manga" ? `manga-${v.id}` : v.id.toString()}
              media={v}
              onShowDetails={
                activeTab === "manga" ? handleMangaDetails : onShowDetails
              }
            />
          ))}
        </MediaGrid>
      )}

      <SearchSuffix results={total} />
    </div>
  );
}
