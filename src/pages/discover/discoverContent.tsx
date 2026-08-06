import { useCallback, useMemo, useRef } from "react";

import { WideContainer } from "@/components/layout/WideContainer";
import { useDiscoverStore } from "@/stores/discover";
import { useOverlayStack } from "@/stores/interface/overlayStack";
import { useProgressStore } from "@/stores/progress";
import { MediaItem } from "@/utils/media/mediaTypes";

import { DiscoverNavigation } from "./components/DiscoverNavigation";
import type { FeaturedMedia } from "./components/FeaturedCarousel";
import { CarouselDedupeProvider } from "./components/CarouselDedupeContext";
import { LazyMediaCarousel } from "./components/LazyMediaCarousel";
import { ScrollToTopButton } from "./components/ScrollToTopButton";

export function DiscoverContent() {
  const {
    selectedCategory,
    setSelectedCategory,
    selectedGenreId,
  } = useDiscoverStore();
  const { showModal } = useOverlayStack();
  const carouselRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const progressItems = useProgressStore((state) => state.items);

  const isMoviesTab = selectedCategory === "movies";
  const isTVShowsTab = selectedCategory === "tvshows";

  const handleCategoryChange = useCallback((category: string) => {
    setSelectedCategory(category as "movies" | "tvshows");
  }, [setSelectedCategory]);

  const handleShowDetails = useCallback((media: MediaItem | FeaturedMedia) => {
    showModal("discover-details", {
      id: Number(media.id),
      type: media.type === "movie" ? "movie" : "show",
    });
  }, [showModal]);

  const movieProgressItems = useMemo(
    () =>
      Object.entries(progressItems || {}).filter(
        ([, item]) => item.type === "movie",
      ),
    [progressItems],
  );
  const tvProgressItems = useMemo(
    () =>
      Object.entries(progressItems || {}).filter(
        ([, item]) => item.type === "show",
      ),
    [progressItems],
  );

  // Render Movies content with lazy loading. Earlier rows keep overlapping
  // titles; later rows drop them so each poster shows once (All and genre).
  // Under a genre chip, eager-load every row so claim order is stable
  // (lazy mount races were leaving duplicates and starving later carousels).
  const renderMoviesContent = () => {
    const carousels = [];
    let dedupe = 0;
    const eager = Boolean(selectedGenreId);
    const rowPriority = () => eager || carousels.length < 2;

    // Movie Recommendations - only show if there are movie progress items
    if (movieProgressItems.length > 0) {
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

    // Provider Movies
    carousels.push(
      <LazyMediaCarousel
        key="movie-providers"
        content={{ type: "provider" }}
        isTVShow={false}
        carouselRefs={carouselRefs}
        onShowDetails={handleShowDetails}
        showProviders
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
    const eager = Boolean(selectedGenreId);
    const rowPriority = () => eager || carousels.length < 2;

    // TV Show Recommendations - only show if there are TV show progress items
    if (tvProgressItems.length > 0) {
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

    // Provider TV Shows
    carousels.push(
      <LazyMediaCarousel
        key="tv-providers"
        content={{ type: "provider" }}
        isTVShow
        carouselRefs={carouselRefs}
        onShowDetails={handleShowDetails}
        showProviders
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
      </WideContainer>

      <ScrollToTopButton />

      {/* DetailsModal is now managed by overlayStack */}
    </div>
  );
}

export default DiscoverContent;
