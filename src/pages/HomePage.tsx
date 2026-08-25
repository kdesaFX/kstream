import { useEffect, useRef, useState, type ReactNode } from "react";
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
import { HomeHero } from "@/pages/parts/home/HomeHero";
import { ReadingCarousel } from "@/pages/parts/home/ReadingCarousel";
import { ReadingGrid } from "@/pages/parts/home/ReadingGrid";
import { WatchingCarousel } from "@/pages/parts/home/WatchingCarousel";
import { WatchingGrid } from "@/pages/parts/home/WatchingGrid";
import { SearchListPart } from "@/pages/parts/search/SearchListPart";
import { SearchLoadingPart } from "@/pages/parts/search/SearchLoadingPart";
import { conf } from "@/setup/config";
import { useOverlayStack } from "@/stores/interface/overlayStack";
import {
  shouldShowMangaProgress,
  useMangaProgressStore,
} from "@/stores/mangaProgress";
import { usePreferencesStore } from "@/stores/preferences";
import { useProgressStore } from "@/stores/progress";
import { shouldShowProgress } from "@/stores/progress/utils";
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
  const [showReading, setShowReading] = useState(false);
  // Real width check kept only if needed elsewhere; ads always use bottom stack
  // (Chrome ultra-wide used to swap in a side skyscraper — user prefers two bottom).
  const { showModal } = useOverlayStack();
  const enableDiscover = usePreferencesStore((state) => state.enableDiscover);
  const enableFeatured = usePreferencesStore((state) => state.enableFeatured);
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

  const hasContinueWatching = useProgressStore((state) =>
    Object.values(state.items).some((item) => shouldShowProgress(item).show),
  );
  const hasContinueReading = useMangaProgressStore((state) =>
    Object.values(state.items).some((item) => shouldShowMangaProgress(item)),
  );
  const hasContinueRows = hasContinueWatching || hasContinueReading;

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
        id: String(media.id),
        mangaId: String(media.id),
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

    // Ads sit under Continue Watching / Reading when those rows exist.
    // If both are empty, park ads after the rest of the home sections so they
    // don't sit directly under the hero.
    const lastContinueIdx = Math.max(
      order.indexOf("watching"),
      order.indexOf("reading"),
    );
    const homeAds = (
      <div
        key="home-ads"
        className="w-full flex flex-col items-center gap-4 px-4"
      >
        <HomeAd />
        <HomeAd slot="secondary" />
      </div>
    );

    const sections: ReactNode[] = [];
    order.forEach((section, index) => {
      switch (section) {
        case "watching":
          sections.push(
            enableCarouselView ? (
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
            ),
          );
          break;
        case "reading":
          sections.push(
            enableCarouselView ? (
              <ReadingCarousel
                key="reading"
                carouselRefs={carouselRefs}
                onShowDetails={handleShowDetails}
              />
            ) : (
              <ReadingGrid
                key="reading"
                onItemsChange={setShowReading}
                onShowDetails={handleShowDetails}
              />
            ),
          );
          break;
        case "bookmarks":
          sections.push(
            enableCarouselView ? (
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
            ),
          );
          break;
        default:
          break;
      }

      if (
        hasContinueRows &&
        index === lastContinueIdx &&
        lastContinueIdx >= 0
      ) {
        sections.push(homeAds);
      }
    });

    if (!hasContinueRows) {
      sections.push(homeAds);
    }

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
    <HomeLayout
      showBg={s.searching}
      showLightbar={!enableFeatured}
      // Classic hero owns the big search at rest; once results show the hero
      // collapses, so put search back in the nav (Low/Mid Featured-off).
      showNavSearch={enableFeatured || s.searching}
    >
      <div className="relative mb-2">
        <Helmet>
          <style type="text/css">{`
            html, body {
              scrollbar-gutter: stable;
            }
          `}</style>
          <title>{t("global.name")}</title>
        </Helmet>

        {enableFeatured ? (
          <FeaturedCarousel
            onShowDetails={handleShowDetails}
            searching={s.searching}
          />
        ) : (
          <HomeHero searching={s.searching} />
        )}

        {conf().SHOW_SUPPORT_BAR ? <SupportBar /> : null}
        {conf().SHOW_AD ? <AdsPart /> : null}
      </div>

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

      {!search && <div>{renderHomeSections()}</div>}

      <WideContainer ultraWide classNames="!px-3 md:!px-9">
        {!(showBookmarks || showWatching || showReading) &&
        !enableDiscover ? (
          <div className="flex flex-col translate-y-[-30px] items-center justify-center pt-20">
            <p className="text-[18.5px] pb-3">{emptyText}</p>
          </div>
        ) : null}

        {/* Breathing room between the last home row and the discover tabs. */}
        {enableDiscover && <div className="pb-12" />}

        {enableDiscover && !search ? (
          <DiscoverContent />
        ) : null}
      </WideContainer>
    </HomeLayout>
  );
}
