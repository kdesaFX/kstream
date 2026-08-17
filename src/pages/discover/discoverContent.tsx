import { useCallback, useMemo, useRef } from "react";

import { WideContainer } from "@/components/layout/WideContainer";
import { useDiscoverStore } from "@/stores/discover";
import { useOverlayStack } from "@/stores/interface/overlayStack";
import { usePreferencesStore } from "@/stores/preferences";
import { useProgressStore } from "@/stores/progress";
import { progressHasMeaningfulWatch } from "@/stores/progress/utils";
import { MediaItem } from "@/utils/media/mediaTypes";

import { DiscoverNavigation } from "./components/DiscoverNavigation";
import type { FeaturedMedia } from "./components/FeaturedCarousel";
import { CarouselDedupeProvider } from "./components/CarouselDedupeContext";
import { LazyMediaCarousel } from "./components/LazyMediaCarousel";
import { MangaCarousel } from "./components/MangaCarousel";
import { ScrollToTopButton } from "./components/ScrollToTopButton";

export function DiscoverContent() {
  const {
    selectedCategory,
    setSelectedCategory,
    selectedGenreId,
  } = useDiscoverStore();
  const { showModal } = useOverlayStack();
  const enableMangaDiscover = usePreferencesStore((s) => s.enableMangaDiscover);
  const carouselRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const progressItems = useProgressStore((state) => state.items);

  const isMoviesTab = selectedCategory === "movies";
  const isTVShowsTab = selectedCategory === "tvshows";
  const isMangaTab = selectedCategory === "manga";

  const handleCategoryChange = useCallback((category: string) => {
    setSelectedCategory(category as "movies" | "tvshows" | "manga");
  }, [setSelectedCategory]);

  const handleShowDetails = useCallback((media: MediaItem | FeaturedMedia) => {
    if ("type" in media && media.type === "manga") {
      showModal("manga-details", {
        id: String(media.id),
        mangaId: String(media.id),
        type: "manga",
      });
      return;
    }
    showModal("discover-details", {
      id: Number(media.id),
      type: media.type === "movie" ? "movie" : "show",
    });
  }, [showModal]);

  const movieProgressItems = useMemo(
    () =>
      Object.entries(progressItems || {}).filter(
        ([, item]) =>
          item.type === "movie" && progressHasMeaningfulWatch(item),
      ),
    [progressItems],
  );
  const tvProgressItems = useMemo(
    () =>
      Object.entries(progressItems || {}).filter(
        ([, item]) =>
          item.type === "show" && progressHasMeaningfulWatch(item),
      ),
    [progressItems],
  );

  // Render Movies content with lazy loading. Earlier rows keep overlapping
  // titles; later rows drop them so each poster shows once (All and genre).
  // Keep first two rows priority; never eager-mount the whole page under a
  // genre chip (that used to fire every carousel's TMDB fetch at once).
  const renderMoviesContent = () => {
    const carousels = [];
    let dedupe = 0;
    const rowPriority = () => carousels.length < 2;

    // Because You Watched — All only (not under a genre chip)
    if (movieProgressItems.length > 0 && !selectedGenreId) {
      carousels.push(
        <LazyMediaCarousel
          key="movie-recommendations"
          content={{ type: "recommendations" }}
          isTVShow={false}
          carouselRefs={carouselRefs}
          onShowDetails={handleShowDetails}
          moreContent
          showRecommendations
          priority={rowPriority()}
          enabled={isMoviesTab}
          dedupePriority={dedupe++}
          genreId={selectedGenreId}
        />,
      );
    }

    // Top 10 Movies
    carousels.push(
      <LazyMediaCarousel
        key="movie-top10"
        content={{ type: "top10", fallback: "popular" }}
        isTVShow={false}
        carouselRefs={carouselRefs}
        onShowDetails={handleShowDetails}
        moreContent
        priority={rowPriority()}
        enabled={isMoviesTab}
        dedupePriority={dedupe++}
        genreId={selectedGenreId}
      />,
    );

    // Latest Releases
    carousels.push(
      <LazyMediaCarousel
        key="movie-latest"
        content={{ type: "latest", fallback: "nowPlaying" }}
        isTVShow={false}
        carouselRefs={carouselRefs}
        onShowDetails={handleShowDetails}
        moreContent
        priority={rowPriority()}
        enabled={isMoviesTab}
        dedupePriority={dedupe++}
        genreId={selectedGenreId}
      />,
    );

    // Popular This Week — TMDB trending/week (not /movie/popular; that
    // overlaps Most Popular and used to leave this row nearly empty).
    carousels.push(
      <LazyMediaCarousel
        key="movie-popular-this-week"
        content={{ type: "popularThisWeek" }}
        isTVShow={false}
        carouselRefs={carouselRefs}
        onShowDetails={handleShowDetails}
        moreContent
        priority={rowPriority()}
        enabled={isMoviesTab}
        dedupePriority={dedupe++}
        genreId={selectedGenreId}
      />,
    );

    // Popular Picks — random-popular pool (see getAllTimeBestMovies),
    // standalone alongside the rest.
    carousels.push(
      <LazyMediaCarousel
        key="movie-random-popular"
        content={{ type: "randomPopular" }}
        isTVShow={false}
        carouselRefs={carouselRefs}
        onShowDetails={handleShowDetails}
        moreContent
        priority={rowPriority()}
        enabled={isMoviesTab}
        dedupePriority={dedupe++}
        genreId={selectedGenreId}
      />,
    );

    // Top Rated
    carousels.push(
      <LazyMediaCarousel
        key="movie-top-rated"
        content={{ type: "topRated" }}
        isTVShow={false}
        carouselRefs={carouselRefs}
        onShowDetails={handleShowDetails}
        moreContent
        priority={rowPriority()}
        enabled={isMoviesTab}
        dedupePriority={dedupe++}
        genreId={selectedGenreId}
      />,
    );

    return (
      <CarouselDedupeProvider key={`movies-dedupe-${selectedGenreId ?? "all"}`}>
        {carousels}
      </CarouselDedupeProvider>
    );
  };

  // Render TV Shows content with lazy loading
  const renderTVShowsContent = () => {
    const carousels = [];
    let dedupe = 0;
    const rowPriority = () => carousels.length < 2;

    // Because You Watched — All only (not under a genre chip)
    if (tvProgressItems.length > 0 && !selectedGenreId) {
      carousels.push(
        <LazyMediaCarousel
          key="tv-recommendations"
          content={{ type: "recommendations" }}
          isTVShow
          carouselRefs={carouselRefs}
          onShowDetails={handleShowDetails}
          moreContent
          showRecommendations
          priority={rowPriority()}
          enabled={isTVShowsTab}
          dedupePriority={dedupe++}
          genreId={selectedGenreId}
        />,
      );
    }

    // On Air
    carousels.push(
      <LazyMediaCarousel
        key="tv-on-air"
        content={{ type: "latesttv", fallback: "onTheAir" }}
        isTVShow
        carouselRefs={carouselRefs}
        onShowDetails={handleShowDetails}
        moreContent
        priority={rowPriority()}
        enabled={isTVShowsTab}
        dedupePriority={dedupe++}
        genreId={selectedGenreId}
      />,
    );

    // Top Rated
    carousels.push(
      <LazyMediaCarousel
        key="tv-top-rated"
        content={{ type: "topRated" }}
        isTVShow
        carouselRefs={carouselRefs}
        onShowDetails={handleShowDetails}
        moreContent
        priority={rowPriority()}
        enabled={isTVShowsTab}
        dedupePriority={dedupe++}
        genreId={selectedGenreId}
      />,
    );

    // Popular
    carousels.push(
      <LazyMediaCarousel
        key="tv-popular"
        content={{ type: "popular" }}
        isTVShow
        carouselRefs={carouselRefs}
        onShowDetails={handleShowDetails}
        moreContent
        priority={rowPriority()}
        enabled={isTVShowsTab}
        dedupePriority={dedupe++}
        genreId={selectedGenreId}
      />,
    );

    // Popular This Week — TMDB's actual trending endpoint, standalone
    // alongside the rest.
    carousels.push(
      <LazyMediaCarousel
        key="tv-popular-this-week"
        content={{ type: "popularThisWeek" }}
        isTVShow
        carouselRefs={carouselRefs}
        onShowDetails={handleShowDetails}
        moreContent
        priority={rowPriority()}
        enabled={isTVShowsTab}
        dedupePriority={dedupe++}
        genreId={selectedGenreId}
      />,
    );

    // Popular Picks — random-popular pool (see getAllTimeBestShows),
    // standalone alongside the rest.
    carousels.push(
      <LazyMediaCarousel
        key="tv-random-popular"
        content={{ type: "randomPopular" }}
        isTVShow
        carouselRefs={carouselRefs}
        onShowDetails={handleShowDetails}
        moreContent
        priority={rowPriority()}
        enabled={isTVShowsTab}
        dedupePriority={dedupe++}
        genreId={selectedGenreId}
      />,
    );

    return (
      <CarouselDedupeProvider key={`tv-dedupe-${selectedGenreId ?? "all"}`}>
        {carousels}
      </CarouselDedupeProvider>
    );
  };

  const renderMangaContent = () => (
    <div>
      <MangaCarousel
        kind="popular"
        enabled={isMangaTab}
        carouselRefs={carouselRefs}
        onShowDetails={handleShowDetails}
      />
      <MangaCarousel
        kind="topRated"
        enabled={isMangaTab}
        carouselRefs={carouselRefs}
        onShowDetails={handleShowDetails}
      />
      <MangaCarousel
        kind="latest"
        enabled={isMangaTab}
        carouselRefs={carouselRefs}
        onShowDetails={handleShowDetails}
      />
      <MangaCarousel
        kind="recentlyAdded"
        enabled={isMangaTab}
        carouselRefs={carouselRefs}
        onShowDetails={handleShowDetails}
      />
    </div>
  );

  return (
    <div className="relative min-h-screen">
      <DiscoverNavigation
        selectedCategory={selectedCategory}
        onCategoryChange={handleCategoryChange}
      />

      <WideContainer ultraWide classNames="!px-0">
        {/* Movies Tab */}
        <div style={{ display: isMoviesTab ? "block" : "none" }}>
          {renderMoviesContent()}
        </div>

        {/* TV Shows Tab */}
        <div style={{ display: isTVShowsTab ? "block" : "none" }}>
          {renderTVShowsContent()}
        </div>

        {/* Manga Tab */}
        {enableMangaDiscover ? (
          <div style={{ display: isMangaTab ? "block" : "none" }}>
            {renderMangaContent()}
          </div>
        ) : null}
      </WideContainer>

      <ScrollToTopButton />

      {/* DetailsModal is now managed by overlayStack */}
    </div>
  );
}

export default DiscoverContent;
