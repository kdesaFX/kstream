import classNames from "classnames";
import { t } from "i18next";
import { useRef } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/buttons/Button";
import { WideContainer } from "@/components/layout/WideContainer";
import { useDiscoverStore } from "@/stores/discover";
import { useOverlayStack } from "@/stores/interface/overlayStack";
import { useProgressStore } from "@/stores/progress";
import { MediaItem } from "@/utils/media/mediaTypes";

import { DiscoverNavigation } from "./components/DiscoverNavigation";
import type { FeaturedMedia } from "./components/FeaturedCarousel";
import { ForYouConfidenceCarousel } from "./components/ForYouConfidenceCarousel";
import { ForYouWeightCarousel } from "./components/ForYouWeightCarousel";
import { useHasRecommendationSignal } from "./hooks/usePersonalRecommendations";
import { LazyMediaCarousel } from "./components/LazyMediaCarousel";
import { PersonalRecommendationsCarousel } from "./components/PersonalRecommendationsCarousel";
import { ScrollToTopButton } from "./components/ScrollToTopButton";

export function DiscoverContent() {
  const { selectedCategory, hasManuallySelected, setSelectedCategory } =
    useDiscoverStore();
  // Matches the same "is there real signal" check FeaturedCarousel and
  // usePersonalRecommendations use — a rating alone isn't enough.
  const hasMovieSignal = useHasRecommendationSignal(false);
  const hasShowSignal = useHasRecommendationSignal(true);
  const navigate = useNavigate();
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
  const isEditorPicksTab = effectiveCategory === "editorpicks";

  const handleCategoryChange = (category: string) => {
    setSelectedCategory(
      category as "foryou" | "movies" | "tvshows" | "editorpicks",
    );
  };

  const handleShowDetails = async (media: MediaItem | FeaturedMedia) => {
    showModal("discover-details", {
      id: Number(media.id),
      type: media.type === "movie" ? "movie" : "show",
    });
  };

  const movieProgressItems = Object.entries(progressItems || {}).filter(
    ([_, item]) => item.type === "movie",
  );
  const tvProgressItems = Object.entries(progressItems || {}).filter(
    ([_, item]) => item.type === "show",
  );

  // Render For You content. Order: confidence tiers (how strongly a pick
  // matches your taste, from the recommendation score) and weight tiers
  // (genre-based intensity — easy/comfort vs. serious/heavy) both sit above
  // the plain overall Movies/Shows rows, since they're the more specific,
  // more useful cut of the same underlying recommendations.
  const renderForYouContent = () => (
    <>
      <ForYouConfidenceCarousel
        key="foryou-sure"
        tier="sure"
        title="Sure Bets"
        carouselRefs={carouselRefs}
        onShowDetails={handleShowDetails}
      />
      <ForYouConfidenceCarousel
        key="foryou-worth-a-look"
        tier="worthALook"
        title="Worth a Look"
        carouselRefs={carouselRefs}
        onShowDetails={handleShowDetails}
      />
      <ForYouConfidenceCarousel
        key="foryou-something-new"
        tier="somethingNew"
        title="Something New"
        carouselRefs={carouselRefs}
        onShowDetails={handleShowDetails}
      />
      <ForYouWeightCarousel
        key="foryou-light"
        weight="light"
        title="Easy Watching"
        carouselRefs={carouselRefs}
        onShowDetails={handleShowDetails}
      />
      <ForYouWeightCarousel
        key="foryou-medium"
        weight="medium"
        title="Balanced Picks"
        carouselRefs={carouselRefs}
        onShowDetails={handleShowDetails}
      />
      <ForYouWeightCarousel
        key="foryou-heavy"
        weight="heavy"
        title="Heavy Hitters"
        carouselRefs={carouselRefs}
        onShowDetails={handleShowDetails}
      />
      <PersonalRecommendationsCarousel
        key="foryou-movies"
        isTVShow={false}
        carouselRefs={carouselRefs}
        onShowDetails={handleShowDetails}
        title={t("discover.tabs.movies")}
      />
      <PersonalRecommendationsCarousel
        key="foryou-shows"
        isTVShow
        carouselRefs={carouselRefs}
        onShowDetails={handleShowDetails}
        title={t("discover.tabs.tvshows")}
      />
    </>
  );

  // Render Movies content with lazy loading
  const renderMoviesContent = () => {
    const carousels = [];

    // For You - personal recommendations from watch history, progress, and bookmarks
    carousels.push(
      <PersonalRecommendationsCarousel
        key="movie-for-you"
        isTVShow={false}
        carouselRefs={carouselRefs}
        onShowDetails={handleShowDetails}
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
      />,
    );

    // Popular This Week — TMDB's actual trending endpoint, standalone
    // (not a Trakt fallback), alongside Latest Releases/Top 10 rather than
    // replacing anything.
    carousels.push(
      <LazyMediaCarousel
        key="movie-popular-this-week"
        content={{ type: "popularThisWeek" }}
        isTVShow={false}
        carouselRefs={carouselRefs}
        onShowDetails={handleShowDetails}
        moreContent
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
      />,
    );

    // 4K Releases
    // carousels.push(
    //   <LazyMediaCarousel
    //     key="movie-4k"
    //     content={{ type: "latest4k", fallback: "popular" }}
    //     isTVShow={false}
    //     carouselRefs={carouselRefs}
    //     onShowDetails={handleShowDetails}
    //     moreContent
    //     priority={carousels.length < 2}
    //   />,
    // );

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
      />,
    );

    // Genre Movies
    carousels.push(
      <LazyMediaCarousel
        key="movie-genres"
        content={{ type: "genre" }}
        isTVShow={false}
        carouselRefs={carouselRefs}
        onShowDetails={handleShowDetails}
        showGenres
        moreContent
      />,
    );

    return carousels;
  };

  // Render TV Shows content with lazy loading
  const renderTVShowsContent = () => {
    const carousels = [];

    // For You - personal recommendations from watch history, progress, and bookmarks
    carousels.push(
      <PersonalRecommendationsCarousel
        key="tv-for-you"
        isTVShow
        carouselRefs={carouselRefs}
        onShowDetails={handleShowDetails}
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
      />,
    );

    // Genre TV Shows
    carousels.push(
      <LazyMediaCarousel
        key="tv-genres"
        content={{ type: "genre" }}
        isTVShow
        carouselRefs={carouselRefs}
        onShowDetails={handleShowDetails}
        showGenres
        moreContent
      />,
    );

    return carousels;
  };

  // Render Editor Picks content
  const renderEditorPicksContent = () => {
    return (
      <>
        <LazyMediaCarousel
          content={{ type: "editorPicks" }}
          isTVShow={false}
          carouselRefs={carouselRefs}
          onShowDetails={handleShowDetails}
          moreContent
          priority // Editor picks load immediately since they're the main content
        />
        <LazyMediaCarousel
          content={{ type: "editorPicks" }}
          isTVShow
          carouselRefs={carouselRefs}
          onShowDetails={handleShowDetails}
          moreContent
          priority // Editor picks load immediately since they're the main content
        />
      </>
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

        {/* Editor Picks Tab */}
        <div style={{ display: isEditorPicksTab ? "block" : "none" }}>
          {renderEditorPicksContent()}
        </div>
      </WideContainer>

      {/* View All Button */}
      <div
        className={classNames(
          "flex justify-center mt-8 mb-12",
          isMoviesTab ? "block" : "hidden",
        )}
      >
        <Button theme="purple" onClick={() => navigate("/discover/all")}>
          {t("discover.viewLists")}
        </Button>
      </div>

      <ScrollToTopButton />

      {/* DetailsModal is now managed by overlayStack */}
    </div>
  );
}

export default DiscoverContent;
