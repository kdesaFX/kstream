import { useEffect, useRef, useState } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";

import { WideContainer } from "@/components/layout/WideContainer";
import { useDebounce } from "@/hooks/useDebounce";
import { useRandomTranslation } from "@/hooks/useRandomTranslation";
import { useSearchQuery } from "@/hooks/useSearchQuery";
import { FeaturedCarousel } from "@/pages/discover/components/FeaturedCarousel";
import type { FeaturedMedia } from "@/pages/discover/components/FeaturedCarousel";
import DiscoverContent from "@/pages/discover/discoverContent";
import { HomeLayout } from "@/pages/layouts/HomeLayout";
import { BookmarksCarousel } from "@/pages/parts/home/BookmarksCarousel";
import { BookmarksGrid } from "@/pages/parts/home/BookmarksGrid";
import { ReadingCarousel } from "@/pages/parts/home/ReadingCarousel";
import { WatchingCarousel } from "@/pages/parts/home/WatchingCarousel";
import { WatchingGrid } from "@/pages/parts/home/WatchingGrid";
import { SearchListPart } from "@/pages/parts/search/SearchListPart";
import { SearchLoadingPart } from "@/pages/parts/search/SearchLoadingPart";
import { conf } from "@/setup/config";
import { useOverlayStack } from "@/stores/interface/overlayStack";
import { usePreferencesStore } from "@/stores/preferences";
import { MediaItem } from "@/utils/media/mediaTypes";

import { AdsPart } from "./parts/home/AdsPart";
import { HomeAd } from "./parts/home/HomeAd";
import { SupportBar } from "./parts/home/SupportBar";

function useSearch(search: string) {
  const [searching, setSearching] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  const debouncedSearch = useDebounce<string>(search, 500);
  const lastSearch = useRef<string | null>(null);
  useEffect(() => {
    setSearching(search !== "");
    setLoading(search !== "");
    // A brand new query belongs at the top of its results, but arriving on the
    // page doesn't: this also ran on mount, so coming back from a title threw
    // the viewer to the top of a list they'd scrolled deep into.
    const isNewQuery =
      lastSearch.current !== null && lastSearch.current !== search;
    lastSearch.current = search;
    if (search !== "" && isNewQuery) {
      window.scrollTo(0, 0);
    }
  }, [search]);
  useEffect(() => {
    setLoading(false);
  }, [debouncedSearch]);

  return {
    loading,
    searching,
  };
}

export function HomePage() {
  const { t } = useTranslation();
  const { t: randomT } = useRandomTranslation();
  const emptyText = randomT(`home.search.empty`);
  const [search] = useSearchQuery();
  const s = useSearch(search);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showWatching, setShowWatching] = useState(false);
  // Real width check (not a CSS breakpoint) so exactly one <HomeAd> instance
  // ever mounts -- rendering two copies toggled by CSS visibility both hits
  // the ad script's dedupe-by-id guard, so whichever one mounts first can
  // "win" the real script even while sitting in a display:none container,
  // leaving the visible copy permanently empty.
  const [hasWideMargins, setHasWideMargins] = useState(false);
  useEffect(() => {
    function onResize() {
      setHasWideMargins(window.innerWidth >= 1536);
    }
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const { showModal } = useOverlayStack();
  const enableDiscover = usePreferencesStore((state) => state.enableDiscover);
  const carouselRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const enableCarouselView = usePreferencesStore(
    (state) => state.enableCarouselView,
  );
  const enableLowPerformanceMode = usePreferencesStore(
    (state) => state.enableLowPerformanceMode,
  );
  const homeSectionOrder = usePreferencesStore(
    (state) => state.homeSectionOrder,
  );

  const [carouselContainerRef, enableCarouselAnimate] =
    useAutoAnimate<HTMLDivElement>();
  const [listContainerRef, enableListAnimate] = useAutoAnimate<HTMLDivElement>();

  useEffect(() => {
    enableCarouselAnimate(!enableLowPerformanceMode);
    enableListAnimate(!enableLowPerformanceMode);
  }, [
    enableLowPerformanceMode,
    enableCarouselAnimate,
    enableListAnimate,
  ]);

  const handleShowDetails = async (media: MediaItem | FeaturedMedia) => {
    if ("type" in media && media.type === "manga") {
      showModal("manga-details", {
        id: media.id,
        mangaId: media.id,
        type: "manga",
      });
      return;
    }
    showModal("details", {
      id: Number(media.id),
      type: media.type === "movie" ? "movie" : "show",
    });
  };

  const renderHomeSections = () => {
    // Ensure Continue Reading sits under Continue Watching even for
    // profiles that saved an older homeSectionOrder without "reading".
    let order = [...homeSectionOrder];
    if (!order.includes("reading")) {
      const watchingIdx = order.indexOf("watching");
      order.splice(watchingIdx >= 0 ? watchingIdx + 1 : 0, 0, "reading");
    }

    const sections = order.map((section) => {
      switch (section) {
        case "watching":
          return enableCarouselView ? (
            <WatchingCarousel
              key="watching"
              carouselRefs={carouselRefs}
              onShowDetails={handleShowDetails}
            />
          ) : (
            <WatchingGrid
              key="watching"
              onItemsChange={setShowWatching}
              onShowDetails={handleShowDetails}
            />
          );
        case "reading":
          return (
            <ReadingCarousel key="reading" carouselRefs={carouselRefs} />
          );
        case "bookmarks":
          return enableCarouselView ? (
            <BookmarksCarousel
              key="bookmarks"
              carouselRefs={carouselRefs}
              onShowDetails={handleShowDetails}
            />
          ) : (
            <BookmarksGrid
              key="bookmarks"
              onItemsChange={setShowBookmarks}
              onShowDetails={handleShowDetails}
            />
          );
        default:
          return null;
      }
    });

    if (enableCarouselView) {
      return (
        <WideContainer ultraWide classNames="!px-3 md:!px-9">
          <div ref={carouselContainerRef} className="flex flex-col gap-8">
            {sections}
          </div>
        </WideContainer>
      );
    }
    return (
      <WideContainer>
        <div ref={listContainerRef} className="flex flex-col gap-8">
          {sections}
        </div>
      </WideContainer>
    );
  };

  return (
    <HomeLayout showBg={s.searching}>
      <div className="relative mb-2">
        {hasWideMargins && (
          <div className="absolute right-6 top-2 z-10">
            <HomeAd slot="secondary" />
          </div>
        )}
        <Helmet>
          <style type="text/css">{`
            html, body {
              scrollbar-gutter: stable;
            }
          `}</style>
          <title>{t("global.name")}</title>
        </Helmet>

        <FeaturedCarousel
          onShowDetails={handleShowDetails}
          searching={s.searching}
        />

        {conf().SHOW_SUPPORT_BAR ? <SupportBar /> : null}
        {conf().SHOW_AD ? <AdsPart /> : null}
      </div>

      {!search && (
        <div className="w-full flex justify-center px-4 my-6">
          <HomeAd />
        </div>
      )}

      {search && (
        <WideContainer>
          {s.loading ? (
            <SearchLoadingPart />
          ) : (
            s.searching && (
              <SearchListPart
                searchQuery={search}
                onShowDetails={handleShowDetails}
              />
            )
          )}
        </WideContainer>
      )}

      {!search && (
        <div>
          {renderHomeSections()}
          {!hasWideMargins && (
            <div className="w-full flex justify-center my-6 px-4">
              <HomeAd slot="secondary" />
            </div>
          )}
        </div>
      )}

      <WideContainer ultraWide classNames="!px-3 md:!px-9">
        {!(showBookmarks || showWatching) &&
        (!enableDiscover || enableLowPerformanceMode) ? (
          <div className="flex flex-col translate-y-[-30px] items-center justify-center pt-20">
            <p className="text-[18.5px] pb-3">{emptyText}</p>
          </div>
        ) : null}

        {/* Breathing room between the last home row and the discover tabs. */}
        {enableDiscover && <div className="pb-12" />}

        {enableDiscover && !search && !enableLowPerformanceMode ? (
          <DiscoverContent />
        ) : null}
      </WideContainer>
    </HomeLayout>
  );
}
