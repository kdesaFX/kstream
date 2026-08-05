import classNames from "classnames";
import { t } from "i18next";
import { useCallback, useMemo, useRef } from "react";

import { WideContainer } from "@/components/layout/WideContainer";
import { useDiscoverStore } from "@/stores/discover";
import { useOverlayStack } from "@/stores/interface/overlayStack";
import { useProgressStore } from "@/stores/progress";
import { MediaItem } from "@/utils/media/mediaTypes";

import { DiscoverNavigation } from "./components/DiscoverNavigation";
import type { FeaturedMedia } from "./components/FeaturedCarousel";
import { CarouselDedupeProvider } from "./components/CarouselDedupeContext";
import { ForYouConfidenceCarousel } from "./components/ForYouConfidenceCarousel";
import { ForYouWeightCarousel } from "./components/ForYouWeightCarousel";
import { PersonalRecommendationsProvider } from "./components/PersonalRecommendationsProvider";
import { useHasRecommendationSignal } from "./hooks/usePersonalRecommendations";
import { LazyMediaCarousel } from "./components/LazyMediaCarousel";
import { PersonalRecommendationsCarousel } from "./components/PersonalRecommendationsCarousel";
import { ScrollToTopButton } from "./components/ScrollToTopButton";

export function DiscoverContent() {
  const {
    selectedCategory,
    hasManuallySelected,
    setSelectedCategory,
    selectedGenreId,
  } = useDiscoverStore();
  // Matches the same "is there real signal" check FeaturedCarousel and
  // usePersonalRecommendations use — a rating alone isn't enough.
  const hasMovieSignal = useHasRecommendationSignal(false);
  const hasShowSignal = useHasRecommendationSignal(true);
  const { showModal } = useOverlayStack();
  const carouselRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const progressItems = useProgressStore((state) => state.items);

  const showForYou = hasMovieSignal || hasShowSignal;
  // Mirrors FeaturedCarousel's own default-category cascade, so the tab
  // row highlights whichever tab the hero is actually showing.
  const autoDefaultCategory = showForYou ? "foryou" : "movies";
  const effectiveCategory = hasManuallySelected
    ? selectedCategory
    : autoDefaultCategory;

  // Only load data for the active tab
  const isForYouTab = effectiveCategory === "foryou";
  const isMoviesTab = effectiveCategory === "movies";
  const isTVShowsTab = effectiveCategory === "tvshows";

  const handleCategoryChange = useCallback((category: string) => {
    setSelectedCategory(category as "foryou" | "movies" | "tvshows");
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

  // Render For You content. Order: confidence tiers (how strongly a pick
  // matches your taste, from the recommendation score) and weight tiers
  // (genre-based intensity — easy/comfort vs. serious/heavy) both sit above
  // the plain overall Movies/Shows rows, since they're the more specific,
  // more useful cut of the same underlying recommendations.
  const renderForYouContent = () => (
    <PersonalRecommendationsProvider enabled={isForYouTab}>
      <ForYouConfidenceCarousel
        key="foryou-sure"
        tier="sure"
        title="Sure Bets"
        carouselRefs={carouselRefs}
        onShowDetails={handleShowDetails}
        enabled={isForYouTab}
      />
      <ForYouConfidenceCarousel
        key="foryou-worth-a-look"
        tier="worthALook"
        title="Worth a Look"
        carouselRefs={carouselRefs}
        onShowDetails={handleShowDetails}
        enabled={isForYouTab}
      />
      <ForYouConfidenceCarousel
        key="foryou-something-new"
        tier="somethingNew"
        title="Something New"
        carouselRefs={carouselRefs}
        onShowDetails={handleShowDetails}
        enabled={isForYouTab}
      />
      <ForYouWeightCarousel
        key="foryou-light"
        weight="light"
        title="Easy Watching"
        carouselRefs={carouselRefs}
        onShowDetails={handleShowDetails}
        enabled={isForYouTab}
      />
      <ForYouWeightCarousel
        key="foryou-medium"
        weight="medium"
        title="Balanced Picks"
        carouselRefs={carouselRefs}
        onShowDetails={handleShowDetails}
        enabled={isForYouTab}
      />
      <ForYouWeightCarousel
        key="foryou-heavy"
        weight="heavy"
        title="Heavy Hitters"
        carouselRefs={carouselRefs}
        onShowDetails={handleShowDetails}
        enabled={isForYouTab}
      />
      <PersonalRecommendationsCarousel
        key="foryou-movies"
        isTVShow={false}
        carouselRefs={carouselRefs}
        onShowDetails={handleShowDetails}
        title={t("discover.tabs.movies")}
        enabled={isForYouTab}
      />
      <PersonalRecommendationsCarousel
        key="foryou-shows"
        isTVShow
        carouselRefs={carouselRefs}
        onShowDetails={handleShowDetails}
        title={t("discover.tabs.tvshows")}
        enabled={isForYouTab}
      />
    </PersonalRecommendationsProvider>
  );

  // Render Movies content with lazy loading. Earlier rows keep overlapping
  // titles; later rows drop them so each poster shows once (All and genre).
  const renderMoviesContent = () => {
    const carousels = [];
    let dedupe = 0;

    // For You - personal recommendations from watch history, progress, and bookmarks
    carousels.push(
      <PersonalRecommendationsCarousel
        key="movie-for-you"
        isTVShow={false}
        carouselRefs={carouselRefs}
        onShowDetails={handleShowDetails}
        enabled={isMoviesTab}
        dedupePriority={dedupe++}
        genreId={selectedGenreId}
      />,
    );

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
          priority={carousels.length < 2} // First 2 carousels load immediately
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
        priority={carousels.length < 2}
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
        priority={carousels.length < 2}
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
        priority={carousels.length < 2}
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
        enabled={isMoviesTab}
        dedupePriority={dedupe++}
        genreId={selectedGenreId}
      />,
    );

    return (
      <CarouselDedupeProvider key="movies-dedupe">
        {carousels}
      </CarouselDedupeProvider>
    );
  };

  // Render TV Shows content with lazy loading
  const renderTVShowsContent = () => {
    const carousels = [];
    let dedupe = 0;

    // For You - personal recommendations from watch history, progress, and bookmarks
    carousels.push(
      <PersonalRecommendationsCarousel
        key="tv-for-you"
        isTVShow
        carouselRefs={carouselRefs}
        onShowDetails={handleShowDetails}
        enabled={isTVShowsTab}
        dedupePriority={dedupe++}
        genreId={selectedGenreId}
      />,
    );

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
          priority={carousels.length < 2} // First 2 carousels load immediately
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
        priority={carousels.length < 2}
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
        priority={carousels.length < 2}
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
        priority={carousels.length < 2}
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
        enabled={isTVShowsTab}
        dedupePriority={dedupe++}
        genreId={selectedGenreId}
      />,
    );

    return (
      <CarouselDedupeProvider key="tv-dedupe">
        {carousels}
      </CarouselDedupeProvider>
    );
  };

  return (
    <div className="relative min-h-screen">
      <DiscoverNavigation
        selectedCategory={effectiveCategory}
        onCategoryChange={handleCategoryChange}
        showForYou={showForYou}
      />

      <WideContainer ultraWide classNames="!px-0">
        {/* For You Tab */}
        <div style={{ display: isForYouTab ? "block" : "none" }}>
          {renderForYouContent()}
        </div>

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
