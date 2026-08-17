import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { searchManga } from "@/backend/manga/catalog";
import { mangaToMediaItem } from "@/backend/manga/mangadex";
import { searchForMedia } from "@/backend/metadata/search";
import { MWQuery } from "@/backend/metadata/types/mw";
import { IconPatch } from "@/components/buttons/IconPatch";
import { Icons } from "@/components/Icon";
import { SectionHeading } from "@/components/layout/SectionHeading";
import { MediaGrid } from "@/components/media/MediaGrid";
import { WatchedMediaCard } from "@/components/media/WatchedMediaCard";
import { useDebounce } from "@/hooks/useDebounce";
import { Button } from "@/pages/About";
import { SearchLoadingPart } from "@/pages/parts/search/SearchLoadingPart";
import { useOverlayStack } from "@/stores/interface/overlayStack";
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

  const [results, setResults] = useState<MediaItem[]>([]);
  const [mangaResults, setMangaResults] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const requestIdRef = useRef(0);
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

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
      const manga = searchManga(query.searchQuery)
        .then((items) => items.map(mangaToMediaItem))
        .catch(() => [] as MediaItem[]);

      const [a, b] = await Promise.all([movieTv, manga]);
      nextResults = a;
      nextManga = b;

      if (requestIdRef.current !== requestId) return;

      // Only fail the page when movie/TV search failed AND manga also empty.
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
  }, [debouncedSearchQuery]);

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

  return (
    <div className="space-y-8">
      {results.length > 0 ? (
        <div>
          <SectionHeading
            title={t("home.search.sectionTitle")}
            icon={Icons.SEARCH}
          />
          <MediaGrid>
            {results.map((v) => (
              <WatchedMediaCard
                key={v.id.toString()}
                media={v}
                onShowDetails={onShowDetails}
              />
            ))}
          </MediaGrid>
        </div>
      ) : null}

      {mangaResults.length > 0 ? (
        <div>
          <SectionHeading
            title={t("home.search.mangaSectionTitle")}
            icon={Icons.BOOKMARK}
          />
          <MediaGrid>
            {mangaResults.map((v) => (
              <WatchedMediaCard
                key={`manga-${v.id}`}
                media={v}
                onShowDetails={handleMangaDetails}
              />
            ))}
          </MediaGrid>
        </div>
      ) : null}

      <SearchSuffix results={total} />
    </div>
  );
}
