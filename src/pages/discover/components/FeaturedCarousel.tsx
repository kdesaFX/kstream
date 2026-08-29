import classNames from "classnames";
import { t } from "i18next";
import { ReactNode, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWindowSize } from "react-use";

import { mangaMediaLink } from "@/backend/manga/ids";
import { getMangaAdaptationLogo } from "@/backend/manga/mangaLogo";
import { mangaStatusKey } from "@/backend/manga/types";
import { getMediaLogo } from "@/backend/metadata/tmdb";
import {
  getReleaseDetails,
  isTraktEnabled,
} from "@/backend/metadata/traktApi";
import { TMDBContentTypes } from "@/backend/metadata/types/tmdb";
import type { TraktReleaseResponse } from "@/backend/metadata/types/trakt";
import { Icon, Icons } from "@/components/Icon";
import {
  type FeaturedMedia,
  fetchFeaturedHeroMedia,
} from "@/pages/discover/lib/featuredHero";
import { consumeHomeWarmup } from "@/setup/homeWarmup";
import { preloadPlayerView } from "@/setup/routePreload";
import { useDiscoverStore } from "@/stores/discover";
import { useLanguageStore } from "@/stores/language";
import { usePreferencesStore } from "@/stores/preferences";
import { useProgressStore } from "@/stores/progress";
import { useRatingsStore } from "@/stores/ratings";
import { useWatchHistoryStore } from "@/stores/watchHistory";
import { fetchImdbRating } from "@/utils/services/imdbRating";
import { tmdbBackdropSize } from "@/utils/media/artwork";
import { getTmdbLanguageCode } from "@/utils/locale/language";
import { resolveCardArtworkUrl } from "@/utils/media/artwork";

import { RandomMovieButton } from "./RandomMovieButton";

export type { FeaturedMedia } from "@/pages/discover/lib/featuredHero";
export { mangaToFeatured } from "@/pages/discover/lib/featuredHero";

interface FeaturedCarouselProps {
  onShowDetails: (media: FeaturedMedia) => void;
  children?: ReactNode;
  searching?: boolean;
  shorter?: boolean;
}

interface IMDbRatingData {
  rating: number;
  votes: number;
}

const SLIDE_DURATION = 8000;

/**
 * MangaDex and AniList swap in promo images for foreign referrers, so art goes
 * through <img referrerPolicy="no-referrer">. Wide AniList banners fill the hero
 * like TMDB backdrops; portrait covers sit on the right instead of being blurred
 * across the frame.
 */
function MangaSlideArt({
  item,
  isActive,
}: {
  item: FeaturedMedia;
  isActive?: boolean;
}) {
  const artUrl = resolveCardArtworkUrl(item.artUrl);
  if (!artUrl) return null;

  const readOverlay = (
    <>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background-main from-0% via-background-main/50 via-35% to-transparent to-70%" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background-main/90 from-0% via-background-main/35 via-45% to-transparent to-85%" />
    </>
  );

  if (item.wideArt) {
    return (
      <>
        <img
          src={artUrl}
          alt=""
          referrerPolicy="no-referrer"
          decoding={isActive ? "sync" : "async"}
          loading={isActive ? "eager" : "lazy"}
          // eslint-disable-next-line react/no-unknown-property -- LCP hint
          fetchPriority={isActive ? "high" : "low"}
          className="absolute inset-0 h-full w-full object-cover object-[center_20%] no-fade"
        />
        {readOverlay}
      </>
    );
  }

  // Portrait cover only — fill the hero with a blurred plane + cropped cover
  // so we never show an empty black field with a tiny strip of art.
  return (
    <>
      <img
        src={artUrl}
        alt=""
        referrerPolicy="no-referrer"
        decoding="async"
        loading={isActive ? "eager" : "lazy"}
        aria-hidden
        className="absolute inset-0 h-full w-full scale-110 object-cover object-[center_15%] opacity-80 blur-2xl no-fade"
      />
      <img
        src={artUrl}
        alt=""
        referrerPolicy="no-referrer"
        decoding={isActive ? "sync" : "async"}
        loading={isActive ? "eager" : "lazy"}
        // eslint-disable-next-line react/no-unknown-property -- LCP hint
        fetchPriority={isActive ? "high" : "low"}
        className="absolute inset-0 h-full w-full object-cover object-[center_20%] no-fade"
      />
      {readOverlay}
    </>
  );
}

function FeaturedCarouselSkeleton({
  shorter,
  searching,
}: {
  shorter?: boolean;
  searching?: boolean;
}) {
  // Keep in sync with the loaded carousel height classes below.
  const heightClass = searching
    ? "h-24"
    : shorter
      ? "h-[40rem] md:h-[85vh]"
      : "h-[40rem] md:h-[100vh]";

  return (
    <div
      className={classNames(
        "relative w-full transition-[height] duration-300 ease-in-out",
        heightClass,
      )}
    >
      <div className="relative w-full h-full overflow-hidden">
        <div
          className="absolute inset-0 bg-gray-900"
          style={{
            maskImage:
              "linear-gradient(to top, rgba(0, 0, 0, 0), rgba(0, 0, 0, 1) 500px)",
            WebkitMaskImage:
              "linear-gradient(to top, rgba(0, 0, 0, 0), rgba(0, 0, 0, 1) 500px)",
          }}
        />
      </div>

      {/* Navigation Buttons Skeleton */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/30">
        <div className="w-8 h-8 bg-gray-900 rounded-full animate-pulse" />
      </div>
      <div className="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/30">
        <div className="w-8 h-8 bg-gray-900 rounded-full animate-pulse" />
      </div>

      {/* Navigation Dots Skeleton */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[19] flex gap-2">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
          <div
            key={i}
            className="w-2.5 h-2.5 rounded-full bg-gray-900 animate-pulse"
          />
        ))}
      </div>

      {/* Content Overlay Skeleton */}
      <div className="absolute inset-0 flex items-end pb-20 z-10">
        <div className="container mx-auto px-8 md:px-4">
          <div className="max-w-3xl">
            <div className="h-12 w-48 bg-gray-900 rounded animate-pulse mb-6" />
            <div className="space-y-2 mb-6">
              <div className="h-4 bg-gray-900 rounded animate-pulse w-3/4" />
              <div className="h-4 bg-gray-900 rounded animate-pulse w-1/2" />
            </div>
            <div className="flex gap-4 justify-center items-center sm:justify-start">
              <div className="h-10 w-32 bg-gray-900 rounded animate-pulse" />
              <div className="h-10 w-32 bg-gray-900 rounded animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function FeaturedCarousel({
  onShowDetails,
  children,
  searching,
  shorter,
}: FeaturedCarouselProps) {
  // Store normalizes legacy "foryou" → "movies" on load.
  const { selectedCategory: effectiveCategory } = useDiscoverStore();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const [media, setMedia] = useState<FeaturedMedia[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [logoUrl, setLogoUrl] = useState<string | undefined>();
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [imdbRatings, setImdbRatings] = useState<
    Record<string, IMDbRatingData>
  >({});
  const logoFetchController = useRef<AbortController | null>(null);
  const autoPlayInterval = useRef<NodeJS.Timeout | null>(null);
  const navigate = useNavigate();
  const enableImageLogos = usePreferencesStore(
    (state) => state.enableImageLogos,
  );
  const backdropQuality = usePreferencesStore(
    (state) => state.backdropQuality ?? "high",
  );
  const heroBackdropSize = tmdbBackdropSize(backdropQuality);
  const userLanguage = useLanguageStore((s) => s.language);
  const formattedLanguage = getTmdbLanguageCode(userLanguage);
  const { width: windowWidth } = useWindowSize();
  const [releaseInfo, setReleaseInfo] = useState<TraktReleaseResponse | null>(
    null,
  );
  const [contentOpacity, setContentOpacity] = useState(1);
  /** Defer logo / IMDb / release until after first hero can paint. */
  const [enrichmentReady, setEnrichmentReady] = useState(false);
  /** Skip 1s opacity fade on first paint — it delays LCP on the hero image. */
  const [slideFadesEnabled, setSlideFadesEnabled] = useState(false);
  /** Load adjacent slides only after the active hero has a chance to win LCP. */
  const [prefetchNeighbors, setPrefetchNeighbors] = useState(false);

  // Refresh hero when algorithm / high-% watch signal changes.
  const algorithmTick = useRatingsStore((s) =>
    [
      s.preferences.completedOnboarding ? "1" : "0",
      s.preferences.favoriteGenres.join(","),
      s.preferences.moods.join(","),
      s.preferences.franchises.join(","),
      Object.entries(s.ratings)
        .map(([id, r]) => `${id}:${r.rating}`)
        .sort()
        .join(","),
    ].join("|"),
  );
  const historyTick = useWatchHistoryStore((s) =>
    Object.entries(s.items)
      .map(([id, item]) => `${id}:${item.completed ? 1 : 0}`)
      .sort()
      .join(","),
  );
  const progressTick = useProgressStore((s) =>
    Object.keys(s.items).sort().join(","),
  );

  const currentMedia = media[currentIndex];

  // Enable crossfades after the first hero paint window; neighbors wait too.
  useEffect(() => {
    if (isLoading || media.length === 0) {
      setSlideFadesEnabled(false);
      setPrefetchNeighbors(false);
      return undefined;
    }
    const fadeTimer = window.setTimeout(() => setSlideFadesEnabled(true), 1200);
    const neighborTimer = window.setTimeout(
      () => setPrefetchNeighbors(true),
      800,
    );
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(neighborTimer);
    };
  }, [isLoading, media.length]);

  // After hero media lands, wait for idle before secondary fetches.
  useEffect(() => {
    if (isLoading || media.length === 0) {
      setEnrichmentReady(false);
      return undefined;
    }
    let cancelled = false;
    let idleId: number | undefined;
    let timeoutId: number | undefined;
    const mark = () => {
      if (!cancelled) setEnrichmentReady(true);
    };
    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(mark, { timeout: 2000 });
    } else {
      timeoutId = window.setTimeout(mark, 400);
    }
    return () => {
      cancelled = true;
      if (
        idleId !== undefined &&
        typeof window.cancelIdleCallback === "function"
      ) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [isLoading, media]);

  // Check for extension on mount
  // Fetch IMDb ratings when media changes (OMDb key, extension, or proxy)
  useEffect(() => {
    if (!enrichmentReady) return;
    const fetchImdbRatings = async () => {
      const imdbId = currentMedia?.external_ids?.imdb_id;
      if (!imdbId || currentMedia.type === "manga") return;
      if (imdbRatings[imdbId]) return;

      const result = await fetchImdbRating(imdbId, currentMedia.type);
      if (!result) return;

      setImdbRatings((prev) => ({
        ...prev,
        [imdbId]: { rating: result.rating, votes: result.votes },
      }));
    };

    if (currentMedia) {
      void fetchImdbRatings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- skip re-fetch when cache already has this id
  }, [currentMedia, enrichmentReady]);

  useEffect(() => {
    let cancelled = false;

    const applyMedia = (items: FeaturedMedia[]) => {
      if (cancelled) return;
      setMedia(items);
      setIsLoading(false);
    };

    const fetchFeaturedMedia = async () => {
      // Prefer boot-warmup cache on first paint for this category/language.
      const warmed = consumeHomeWarmup(effectiveCategory, formattedLanguage);
      if (warmed && warmed.length > 0) {
        setLogoUrl(undefined);
        setImdbRatings({});
        setReleaseInfo(null);
        setCurrentIndex(0);
        setContentOpacity(1);
        applyMedia(warmed);
        return;
      }

      setIsLoading(true);
      setLogoUrl(undefined);
      setImdbRatings({});
      setReleaseInfo(null);
      setCurrentIndex(0);
      setContentOpacity(1);
      if (logoFetchController.current) {
        logoFetchController.current.abort();
      }
      try {
        const items = await Promise.race([
          fetchFeaturedHeroMedia({
            category: effectiveCategory,
            language: formattedLanguage,
            includePersonalization: true,
          }),
          new Promise<never>((_, reject) => {
            const timer =
              typeof window !== "undefined" ? window.setTimeout : setTimeout;
            timer(
              () => reject(new Error("Featured hero timed out")),
              12000,
            );
          }),
        ]);
        applyMedia(items);
      } catch (error) {
        console.error("Error fetching featured media:", error);
        if (!cancelled) {
          setMedia([]);
          setIsLoading(false);
        }
      }
    };

    void fetchFeaturedMedia();
    return () => {
      cancelled = true;
    };
  }, [
    formattedLanguage,
    effectiveCategory,
    algorithmTick,
    historyTick,
    progressTick,
  ]);

  const handlePrevSlide = () => {
    setContentOpacity(0);
    setImdbRatings({});
    setReleaseInfo(null);

    // Wait for fade out, then change index and fade in
    setTimeout(() => {
      setCurrentIndex((prev) => (prev - 1 + media.length) % media.length);
      // Clear logo after index change so new logo can load
      setLogoUrl(undefined);
      setTimeout(() => setContentOpacity(1), 100);
    }, 150);

    // Reset autoplay timer
    if (autoPlayInterval.current) {
      clearInterval(autoPlayInterval.current);
    }
    if (isAutoPlaying) {
      autoPlayInterval.current = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % media.length);
      }, 5000);
    }
  };

  const handleNextSlide = () => {
    setContentOpacity(0);
    setImdbRatings({});
    setReleaseInfo(null);

    // Wait for fade out, then change index and fade in
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % media.length);
      // Clear logo after index change so new logo can load
      setLogoUrl(undefined);
      setTimeout(() => setContentOpacity(1), 100);
    }, 150);

    // Reset autoplay timer
    if (autoPlayInterval.current) {
      clearInterval(autoPlayInterval.current);
    }
    if (isAutoPlaying) {
      autoPlayInterval.current = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % media.length);
      }, 5000);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const distance = touchStart - touchEnd;
    const minSwipeDistance = 50;

    if (Math.abs(distance) > minSwipeDistance) {
      if (distance > 0) {
        handleNextSlide();
      } else {
        handlePrevSlide();
      }
    }

    setTouchStart(null);
    setTouchEnd(null);
  };

  // Fetch clear logo when current media changes
  useEffect(() => {
    if (!enrichmentReady) return undefined;

    const fetchLogo = async () => {
      // Cancel any in-progress logo fetch
      if (logoFetchController.current) {
        logoFetchController.current.abort();
      }

      // Create new abort controller for this fetch
      logoFetchController.current = new AbortController();

      const currentMediaId = media[currentIndex]?.id;
      const current = media[currentIndex];
      if (!currentMediaId || !current) {
        setLogoUrl(undefined);
        return;
      }

      try {
        // Manga has no TMDB id of its own — borrow the anime adaptation's
        // clear logo when Image logos is on (same setting as movies/TV).
        let logo: string | undefined;
        if (current.type === "manga") {
          logo =
            current.logoUrl ??
            (current.title
              ? await getMangaAdaptationLogo(current.title)
              : undefined);
        } else {
          logo = await getMediaLogo(
            currentMediaId.toString(),
            current.type === "movie"
              ? TMDBContentTypes.MOVIE
              : TMDBContentTypes.TV,
          );
        }
        // Only update if this is still the current media
        if (media[currentIndex]?.id === currentMediaId) {
          setLogoUrl(logo);
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.name === "AbortError") {
          // Ignore abort errors
          return;
        }
        console.error("Error fetching logo:", error);
        setLogoUrl(undefined);
      }
    };

    fetchLogo();

    return () => {
      if (logoFetchController.current) {
        logoFetchController.current.abort();
      }
    };
  }, [currentIndex, media, enrichmentReady]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (logoFetchController.current) {
        logoFetchController.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    if (isAutoPlaying && media.length > 0) {
      autoPlayInterval.current = setInterval(() => {
        setContentOpacity(0);
        setImdbRatings({});
        setReleaseInfo(null);

        // Wait for fade out, then change index and fade in
        setTimeout(() => {
          setCurrentIndex((prev) => (prev + 1) % media.length);
          // Clear logo after index change so new logo can load
          setLogoUrl(undefined);
          setTimeout(() => setContentOpacity(1), 100);
        }, 150);
      }, SLIDE_DURATION);
    }

    return () => {
      if (autoPlayInterval.current) {
        clearInterval(autoPlayInterval.current);
      }
    };
  }, [isAutoPlaying, media.length]);

  useEffect(() => {
    if (!enrichmentReady) return;
    const fetchReleaseInfo = async () => {
      if (currentMedia?.type === "manga") {
        setReleaseInfo(null);
        return;
      }
      if (currentMedia?.id) {
        try {
          const info = await getReleaseDetails(currentMedia.id.toString());
          setReleaseInfo(info);
        } catch (error) {
          console.error("Failed to fetch release info:", error);
        }
      }
    };
    fetchReleaseInfo();
  }, [currentMedia?.id, currentMedia?.type, enrichmentReady]);

  if (isLoading) {
    return <FeaturedCarouselSkeleton shorter={shorter} searching={searching} />;
  }

  // Empty featured must not leave an eternal skeleton (manga resolve miss, etc.).
  if (media.length === 0) {
    return null;
  }

  const mediaTitle = currentMedia.title || currentMedia.name;
  const mangaStatusLabelKey = currentMedia.mangaStatus
    ? mangaStatusKey(currentMedia.mangaStatus)
    : null;

  let searchClasses = "";
  if (searching) searchClasses = "opacity-0 transition-opacity duration-300";
  else searchClasses = "opacity-100 transition-opacity duration-300";

  const getQualityIndicator = () => {
    if (!releaseInfo || currentMedia.type === "show") return null;

    const hasDigitalRelease = !!releaseInfo.digital_release_date;
    const hasTheatricalRelease = !!releaseInfo.theatrical_release_date;

    if (hasDigitalRelease) {
      const digitalReleaseDate = new Date(releaseInfo.digital_release_date!);

      if (new Date() >= digitalReleaseDate) {
        return <span className="text-green-400">HD</span>;
      }
    }

    if (hasTheatricalRelease) {
      const theatricalReleaseDate = new Date(
        releaseInfo.theatrical_release_date!,
      );

      if (new Date() >= theatricalReleaseDate) {
        return (
          <div className="px-2 py-1 rounded-lg backdrop-blur-sm bg-gray-600/40">
            <span className="text-green-400">HD</span>
          </div>
        );
      }

      return (
        <div className="px-2 py-1 rounded-lg backdrop-blur-sm bg-gray-600/40">
          <span className="text-yellow-400">CAM</span>
        </div>
      );
    }

    return null;
  };

  return (
    <div
      className={classNames(
        "relative w-full transition-[height] duration-300 ease-in-out",
        // Fixed heights only — avoid windowHeight races that flip 100vh ↔ 40rem
        // after first paint and spike CLS on the hero container.
        searching
          ? "h-24"
          : shorter
            ? "h-[40rem] md:h-[85vh]"
            : "h-[40rem] md:h-[100vh]",
      )}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className={classNames(
          "relative w-full h-full overflow-hidden",
          searchClasses,
        )}
      >
        {media.map((item, index) => {
          // Only paint nearby slides — loading all 12 as original TMDB
          // backdrops was a multi‑MB hit on every home visit.
          const dist = Math.min(
            Math.abs(index - currentIndex),
            media.length - Math.abs(index - currentIndex),
          );
          const isActive = index === currentIndex;
          const shouldLoad = isActive || (prefetchNeighbors && dist <= 1);
          const fade = classNames(
            "absolute inset-0",
            slideFadesEnabled && "transition-opacity duration-1000",
            isActive ? "opacity-100" : "opacity-0",
          );
          const mask = {
            maskImage:
              "linear-gradient(to top, rgba(0, 0, 0, 0), rgba(0, 0, 0, 1) 700px)",
            WebkitMaskImage:
              "linear-gradient(to top, rgba(0, 0, 0, 0), rgba(0, 0, 0, 1) 700px)",
          };

          if (item.type === "manga") {
            return (
              <div key={item.id} className={fade} style={mask}>
                {shouldLoad ? (
                  <MangaSlideArt item={item} isActive={isActive} />
                ) : null}
              </div>
            );
          }

          return (
            <div key={item.id} className={fade} style={mask}>
              {shouldLoad && item.backdrop_path ? (
                <img
                  src={`https://image.tmdb.org/t/p/${heroBackdropSize}${item.backdrop_path}`}
                  srcSet={
                    heroBackdropSize === "w1280"
                      ? `https://image.tmdb.org/t/p/w780${item.backdrop_path} 780w, https://image.tmdb.org/t/p/w1280${item.backdrop_path} 1280w`
                      : `https://image.tmdb.org/t/p/w500${item.backdrop_path} 500w, https://image.tmdb.org/t/p/w780${item.backdrop_path} 780w`
                  }
                  sizes="100vw"
                  alt=""
                  decoding={isActive ? "sync" : "async"}
                  loading={isActive ? "eager" : "lazy"}
                  // React 18 DOM: fetchPriority is valid; eslint rule lags.
                  // eslint-disable-next-line react/no-unknown-property -- LCP hint
                  fetchPriority={isActive ? "high" : "low"}
                  className="absolute inset-0 h-full w-full object-cover object-top no-fade"
                />
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Navigation Buttons */}
      <button
        type="button"
        onClick={handlePrevSlide}
        className={classNames(
          "absolute left-4 top-[38%] -translate-y-1/2 z-20 p-2 rounded-full bg-black/30 hover:bg-black/50 transition-colors",
          searchClasses,
        )}
        aria-label="Previous slide"
      >
        <Icon icon={Icons.CHEVRON_LEFT} className="text-white w-8 h-8" />
      </button>
      <button
        type="button"
        onClick={handleNextSlide}
        className={classNames(
          "absolute right-4 top-[38%] -translate-y-1/2 z-20 p-2 rounded-full bg-black/30 hover:bg-black/50 transition-colors",
          searchClasses,
        )}
        aria-label="Next slide"
      >
        <Icon icon={Icons.CHEVRON_RIGHT} className="text-white w-8 h-8" />
      </button>

      {/* Navigation Dots */}
      <div
        className={classNames(
          "absolute bottom-8 left-1/2 -translate-x-1/2 z-[19] flex gap-2",
          searchClasses,
        )}
      >
        {media.map((item, index) => (
          <button
            key={`dot-${item.id}`}
            type="button"
            onClick={() => {
              setContentOpacity(0);
              setImdbRatings({});
              setReleaseInfo(null);

              // Wait for fade out, then change index and fade in
              setTimeout(() => {
                setCurrentIndex(index);
                // Clear logo after index change so new logo can load
                setLogoUrl(undefined);
                setTimeout(() => setContentOpacity(1), 100);
              }, 150);

              // Reset autoplay timer when clicking dots
              if (autoPlayInterval.current) {
                clearInterval(autoPlayInterval.current);
              }
              if (isAutoPlaying) {
                autoPlayInterval.current = setInterval(() => {
                  setCurrentIndex((prev) => (prev + 1) % media.length);
                }, 5000);
              }
            }}
            className={`w-2.5 h-2.5 rounded-full transition-all ${
              index === currentIndex
                ? "bg-white scale-125"
                : "bg-white/50 hover:bg-white/75"
            }`}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>

      {/* Content Overlay */}
      <div
        className={classNames(
          "absolute inset-0 flex items-end pb-20 z-10 transition-opacity duration-150",
          searchClasses,
        )}
        style={{ opacity: contentOpacity }}
      >
        <div className="container mx-auto px-8 lg:px-4 w-full">
          <div className="max-w-3xl">
            {logoUrl && enableImageLogos ? (
              <img
                src={logoUrl}
                alt={mediaTitle}
                width={352}
                height={160}
                className="max-w-[14rem] md:max-w-[22rem] max-h-[20vh] w-auto h-auto object-contain drop-shadow-lg bg-transparent mb-6"
                style={{ background: "none" }}
              />
            ) : (
              <h1 className="text-4xl md:text-6xl font-bold text-white mb-4 min-h-[2.5rem] md:min-h-[3.75rem]">
                {mediaTitle}
              </h1>
            )}
            {/* Rating (IMDb) and year/seasons */}
            <div className="flex items-center gap-2 text-sm text-white/80 mb-4">
              {currentMedia.type === "manga" && (
                <>
                  {currentMedia.mangaRating ? (
                    <div className="flex items-center gap-1">
                      <Icon
                        icon={Icons.RISING_STAR}
                        className="text-yellow-400"
                      />
                      <span>{currentMedia.mangaRating.toFixed(1)}</span>
                    </div>
                  ) : null}
                  {currentMedia.year ? (
                    <>
                      {currentMedia.mangaRating ? (
                        <span className="text-white/60">•</span>
                      ) : null}
                      <span>{currentMedia.year}</span>
                    </>
                  ) : null}
                  {mangaStatusLabelKey ? (
                    <>
                      <span className="text-white/60">•</span>
                      <span>{t(mangaStatusLabelKey)}</span>
                    </>
                  ) : null}
                  {currentMedia.mangaLastChapter ? (
                    <>
                      <span className="text-white/60">•</span>
                      <span>
                        {t("discover.featured.latestChapter", {
                          chapter: currentMedia.mangaLastChapter,
                        })}
                      </span>
                    </>
                  ) : null}
                </>
              )}
              {/* Quality Indicator */}
              {getQualityIndicator() && (
                <>
                  {getQualityIndicator()}
                  <span className="text-white/60">•</span>
                </>
              )}
              {(() => {
                const imdbId = currentMedia?.external_ids?.imdb_id;
                const imdb = imdbId ? imdbRatings[imdbId] : undefined;
                if (imdb) {
                  return (
                    <div className="flex items-center gap-1">
                      <Icon icon={Icons.IMDB} className="text-yellow-400" />
                      <span>{imdb.rating.toFixed(1)}</span>
                    </div>
                  );
                }
                return null;
              })()}
              {currentMedia?.release_date && (
                <>
                  {(getQualityIndicator() ||
                    (currentMedia?.external_ids?.imdb_id &&
                      imdbRatings[currentMedia.external_ids.imdb_id])) && (
                    <span className="text-white/60">•</span>
                  )}
                  <span>
                    {(() => {
                      const [yearStr, monthStr] = currentMedia.release_date
                        .slice(0, 10)
                        .split("-");
                      const year = Number(yearStr);
                      const month = Number(monthStr);
                      if (!year || !month) return yearStr;
                      return new Date(year, month - 1, 1).toLocaleDateString(
                        "en-US",
                        { month: "long", year: "numeric" },
                      );
                    })()}
                  </span>
                </>
              )}
              {currentMedia?.type === "show" &&
                currentMedia?.number_of_seasons && (
                  <>
                    <span className="text-white/60">•</span>
                    <span>
                      {currentMedia.number_of_seasons} {t("details.seasons")}
                    </span>
                  </>
                )}
            </div>
            <p className="text-lg text-white mb-6 line-clamp-3 md:line-clamp-4">
              {currentMedia.overview}
            </p>
            <div
              className="flex gap-4 justify-center items-center sm:justify-start"
              onMouseEnter={() => {
                setIsAutoPlaying(false);
                if (currentMedia.type !== "manga") preloadPlayerView();
              }}
              onMouseLeave={() => setIsAutoPlaying(true)}
            >
              <button
                type="button"
                onFocus={() => {
                  if (currentMedia.type !== "manga") preloadPlayerView();
                }}
                onClick={() =>
                  navigate(
                    currentMedia.type === "manga"
                      ? mangaMediaLink(
                          String(currentMedia.id),
                          mediaTitle ?? "",
                        )
                      : `/media/tmdb-${currentMedia.type}-${currentMedia.id}-${mediaTitle?.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
                  )
                }
                className="tabbable cursor-pointer inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 w-full sm:w-auto text-base font-medium bg-pill-background bg-opacity-50 hover:bg-pill-backgroundHover backdrop-blur-lg transition-[transform,background-color] duration-100 hover:scale-105 active:scale-95"
              >
                <Icon
                  icon={currentMedia.type === "manga" ? Icons.FILE : Icons.PLAY}
                  className="text-white"
                />
                <span className="text-white">
                  {currentMedia.type === "manga"
                    ? t("discover.featured.readNow")
                    : t("discover.featured.playNow")}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onShowDetails(currentMedia)}
                className="tabbable cursor-pointer inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 w-full sm:w-auto text-base font-medium bg-pill-background bg-opacity-50 hover:bg-pill-backgroundHover backdrop-blur-lg transition-[transform,background-color] duration-100 hover:scale-105 active:scale-95"
              >
                <Icon
                  icon={Icons.CIRCLE_QUESTION}
                  className="text-white scale-100"
                />
                <span className="text-white">
                  {t("discover.featured.moreInfo")}
                </span>
              </button>
              {currentMedia.type !== "manga" && (
                <div className="hidden lg:block">
                  <RandomMovieButton />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {children && (
        <div
          className={classNames(
            "absolute inset-0 pointer-events-none",
            windowWidth > 1280 ? "pt-0" : "pt-2",
          )}
        >
          <div className="pointer-events-auto z-50">{children}</div>
        </div>
      )}
    </div>
  );
}
