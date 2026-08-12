import classNames from "classnames";
import { t } from "i18next";
import { ReactNode, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWindowSize } from "react-use";

import { get, getMediaLogo, getAllTimeBestMovies, getAllTimeBestShows } from "@/backend/metadata/tmdb";
import {
  getDiscoverContent,
  getReleaseDetails,
  isTraktEnabled,
} from "@/backend/metadata/traktApi";
import { TMDBContentTypes } from "@/backend/metadata/types/tmdb";
import type { TraktReleaseResponse } from "@/backend/metadata/types/trakt";
import { Icon, Icons } from "@/components/Icon";
import { Movie, TVShow } from "@/pages/discover/common";
import {
  getHistorySources,
  hasFeaturedAlgorithmSignal,
} from "@/pages/discover/hooks/usePersonalRecommendations";
import {
  type ProgressSource,
  type RatingSource,
  fetchPersonalRecommendations,
} from "@/pages/discover/lib/personalRecommendations";
import { hydrateMissingCompletedGenres } from "@/pages/discover/lib/watchHistoryGenres";
import { useDiscoverStore } from "@/stores/discover";
import { useLanguageStore } from "@/stores/language";
import { usePreferencesStore } from "@/stores/preferences";
import { useProgressStore } from "@/stores/progress";
import { progressMediaIsHighPercentage } from "@/stores/progress/utils";
import { useRatingsStore } from "@/stores/ratings";
import { useWatchHistoryStore } from "@/stores/watchHistory";
import { fetchImdbRating } from "@/utils/services/imdbRating";
import { getTmdbLanguageCode } from "@/utils/locale/language";

import { RandomMovieButton } from "./RandomMovieButton";

export interface FeaturedMedia extends Partial<Movie & TVShow> {
  children?: ReactNode;
  backdrop_path: string;
  overview: string;
  title?: string;
  name?: string;
  type: "movie" | "show";
  vote_average?: number;
  vote_count?: number;
  number_of_seasons?: number;
  imdb_rating?: number;
  imdb_votes?: number;
  external_ids?: {
    imdb_id?: string;
  };
}

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

const SLIDE_QUANTITY = 12;
const SLIDE_DURATION = 8000;
const FEATURED_RECENT_KEY = "kstream::featured-recent-ids";
const FEATURED_RECENT_MAX = 48;

function getCarouselHeightClass({
  searching,
  shorter,
  windowHeight,
}: {
  searching?: boolean;
  shorter?: boolean;
  windowHeight: number;
}) {
  if (searching) return "h-24";
  if (!shorter) return "h-[40rem] md:h-[100vh]";
  return windowHeight > 600 ? "h-[40rem] md:h-[85vh]" : "h-[100vh]";
}

function shuffleList<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

function readRecentFeaturedIds(): number[] {
  try {
    const raw = localStorage.getItem(FEATURED_RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0);
  } catch {
    return [];
  }
}

function writeRecentFeaturedIds(ids: number[]) {
  try {
    const unique: number[] = [];
    const seen = new Set<number>();
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      unique.push(id);
      if (unique.length >= FEATURED_RECENT_MAX) break;
    }
    localStorage.setItem(FEATURED_RECENT_KEY, JSON.stringify(unique));
  } catch {
    // ignore quota / private mode
  }
}

/** Prefer titles the user hasn't seen in the hero lately; fill with the rest. */
function pickAvoidingRecent(ids: number[], count: number): number[] {
  const recent = new Set(readRecentFeaturedIds());
  const shuffled = shuffleList(ids);
  const fresh = shuffled.filter((id) => !recent.has(id));
  const reused = shuffled.filter((id) => recent.has(id));
  const picked = [...fresh, ...reused].slice(0, count);
  writeRecentFeaturedIds([...picked, ...readRecentFeaturedIds()]);
  return picked;
}

function isFeatureWorthy(item: { backdrop_path?: string | null; overview?: string | null }) {
  return Boolean(item?.backdrop_path && item?.overview?.trim());
}

function FeaturedCarouselSkeleton({
  searching,
  shorter,
  windowHeight,
}: {
  searching?: boolean;
  shorter?: boolean;
  windowHeight: number;
}) {
  return (
    <div
      className={classNames(
        "relative w-full transition-[height] duration-300 ease-in-out",
        getCarouselHeightClass({ searching, shorter, windowHeight }),
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
  const userLanguage = useLanguageStore((s) => s.language);
  const formattedLanguage = getTmdbLanguageCode(userLanguage);
  const { width: windowWidth, height: windowHeight } = useWindowSize();
  const [releaseInfo, setReleaseInfo] = useState<TraktReleaseResponse | null>(
    null,
  );
  const [contentOpacity, setContentOpacity] = useState(1);

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

  // Check for extension on mount
  // Fetch IMDb ratings when media changes (OMDb key, extension, or proxy)
  useEffect(() => {
    const fetchImdbRatings = async () => {
      const imdbId = currentMedia?.external_ids?.imdb_id;
      if (!imdbId) return;
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
  }, [currentMedia]);

  useEffect(() => {
    const mediaKind = effectiveCategory === "movies" ? "movie" : "tv";
    const mediaType = effectiveCategory === "movies" ? "movie" : "show";

    const fetchDetailsForIds = async (ids: number[]) => {
      const details = await Promise.all(
        ids.map((id) =>
          get<any>(`/${mediaKind}/${id}`, {
            language: formattedLanguage,
            append_to_response: "external_ids",
          }).catch(() => null),
        ),
      );
      return details
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .filter(isFeatureWorthy)
        .map((item) => ({
          ...item,
          type: mediaType as "movie" | "show",
        }));
    };

    const fetchTmdbPoolIds = async (limit: number) => {
      const pool =
        effectiveCategory === "movies"
          ? await getAllTimeBestMovies(limit)
          : await getAllTimeBestShows(limit);
      return pool.map((item) => item.id).filter((id) => Number.isFinite(id));
    };

    const fetchFeaturedMedia = async () => {
      setIsLoading(true);
      // Clear all previous data when transitioning
      setLogoUrl(undefined);
      setImdbRatings({});
      setReleaseInfo(null);
      setCurrentIndex(0);
      setContentOpacity(1);
      if (logoFetchController.current) {
        logoFetchController.current.abort(); // Cancel any in-progress logo fetches
      }
      try {
        if (
          effectiveCategory !== "movies" &&
          effectiveCategory !== "tvshows"
        ) {
          return;
        }

        let candidateIds: number[] = [];
        let personalSeedCount = 0;
        const isTVShow = effectiveCategory === "tvshows";

        // Personalized hero when the user has an algorithm (wizard / likes)
        // or high-% watches. Fresh accounts keep the normal discover pool.
        if (hasFeaturedAlgorithmSignal(isTVShow)) {
          try {
            await hydrateMissingCompletedGenres(15);
            const history = getHistorySources(
              useWatchHistoryStore.getState().items,
            );
            const progressItems = useProgressStore.getState().items;
            const progress: ProgressSource[] = Object.entries(progressItems)
              .filter(([, item]) => progressMediaIsHighPercentage(item))
              .map(([tmdbId, item]) => ({ tmdbId, type: item.type }));
            const ratingItems = useRatingsStore.getState().ratings;
            const ratings: RatingSource[] = Object.entries(ratingItems).map(
              ([tmdbId, item]) => ({
                tmdbId,
                type: item.type,
                rating: item.rating,
                genreIds: item.genreIds,
                ratedAt: item.ratedAt,
              }),
            );
            const preferences = useRatingsStore.getState().preferences;
            const excludeIds = new Set<string>();
            for (const key of Object.keys(
              useWatchHistoryStore.getState().items,
            )) {
              excludeIds.add(key.includes("-") ? key.split("-")[0]! : key);
            }
            for (const id of Object.keys(progressItems)) excludeIds.add(id);

            const personal = await fetchPersonalRecommendations(
              isTVShow,
              history,
              progress,
              excludeIds,
              ratings,
              preferences,
            );
            candidateIds = personal
              .map((item) => Number(item.id))
              .filter((id) => Number.isFinite(id) && id > 0);
            personalSeedCount = candidateIds.length;
          } catch (personalError) {
            console.error(
              "Featured carousel personalization failed:",
              personalError,
            );
          }
        }

        // Trakt discover is a good seed, but it used to always take the same
        // first N ids. Shuffle + recent-avoidance, then top up from TMDB.
        try {
          if (!isTraktEnabled()) throw new Error("TRAKT_DISABLED");
          const discoverData = await getDiscoverContent();
          const traktIds =
            effectiveCategory === "movies"
              ? discoverData.movie_tmdb_ids || []
              : discoverData.tv_tmdb_ids || [];
          const seen = new Set(candidateIds);
          for (const id of traktIds) {
            if (seen.has(id)) continue;
            seen.add(id);
            candidateIds.push(id);
          }
        } catch (traktError) {
          if (
            !(traktError instanceof Error) ||
            traktError.message !== "TRAKT_DISABLED"
          ) {
            console.error("Error fetching from Trakt discover:", traktError);
          }
        }

        if (candidateIds.length < SLIDE_QUANTITY * 3) {
          const tmdbIds = await fetchTmdbPoolIds(60);
          const seen = new Set(candidateIds);
          for (const id of tmdbIds) {
            if (seen.has(id)) continue;
            seen.add(id);
            candidateIds.push(id);
          }
        }

        // Prefer personalized seeds when present; fill gaps from discover pool.
        const personalPool = candidateIds.slice(0, personalSeedCount);
        const discoverPool = candidateIds.slice(personalSeedCount);
        const primaryPool =
          personalPool.length > 0 ? personalPool : discoverPool;
        const backupPool = personalPool.length > 0 ? discoverPool : [];

        const pickedIds = pickAvoidingRecent(
          primaryPool,
          Math.min(SLIDE_QUANTITY * 2, primaryPool.length),
        );
        let mediaItems = await fetchDetailsForIds(pickedIds);

        if (mediaItems.length < SLIDE_QUANTITY && backupPool.length > 0) {
          const have = new Set(mediaItems.map((item) => item.id));
          const more = pickAvoidingRecent(
            backupPool.filter((id) => !have.has(id)),
            SLIDE_QUANTITY * 2,
          );
          const extras = await fetchDetailsForIds(more);
          mediaItems = [...mediaItems, ...extras];
        }

        if (mediaItems.length < SLIDE_QUANTITY) {
          const extraIds = await fetchTmdbPoolIds(40);
          const have = new Set(mediaItems.map((item) => item.id));
          const more = pickAvoidingRecent(
            extraIds.filter((id) => !have.has(id)),
            SLIDE_QUANTITY * 2,
          );
          const extras = await fetchDetailsForIds(more);
          mediaItems = [...mediaItems, ...extras];
        }

        const unique: FeaturedMedia[] = [];
        const seenMedia = new Set<number>();
        for (const item of mediaItems) {
          const id = Number(item.id);
          if (!Number.isFinite(id) || seenMedia.has(id)) continue;
          seenMedia.add(id);
          unique.push(item as FeaturedMedia);
          if (unique.length >= SLIDE_QUANTITY) break;
        }
        setMedia(unique);
      } catch (error) {
        console.error("Error fetching featured media:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchFeaturedMedia();
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
    const fetchLogo = async () => {
      // Cancel any in-progress logo fetch
      if (logoFetchController.current) {
        logoFetchController.current.abort();
      }

      // Create new abort controller for this fetch
      logoFetchController.current = new AbortController();

      const currentMediaId = media[currentIndex]?.id;
      if (!currentMediaId) {
        setLogoUrl(undefined);
        return;
      }

      try {
        const logo = await getMediaLogo(
          currentMediaId.toString(),
          media[currentIndex].type === "movie"
            ? TMDBContentTypes.MOVIE
            : TMDBContentTypes.TV,
        );
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
  }, [currentIndex, media]);

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
    const fetchReleaseInfo = async () => {
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
  }, [currentMedia?.id]);

  if (isLoading) {
    return (
      <FeaturedCarouselSkeleton
        searching={searching}
        shorter={shorter}
        windowHeight={windowHeight}
      />
    );
  }

  if (media.length === 0) {
    return (
      <FeaturedCarouselSkeleton
        searching={searching}
        shorter={shorter}
        windowHeight={windowHeight}
      />
    );
  }

  const mediaTitle = currentMedia.title || currentMedia.name;

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
        getCarouselHeightClass({ searching, shorter, windowHeight }),
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
          const shouldLoad = dist <= 1;
          return (
            <div
              key={item.id}
              className={`absolute inset-0 transition-opacity duration-1000 ${
                index === currentIndex ? "opacity-100" : "opacity-0"
              }`}
              style={{
                maskImage:
                  "linear-gradient(to top, rgba(0, 0, 0, 0), rgba(0, 0, 0, 1) 700px)",
                WebkitMaskImage:
                  "linear-gradient(to top, rgba(0, 0, 0, 0), rgba(0, 0, 0, 1) 700px)",
              }}
            >
              {shouldLoad && (
                <img
                  src={`https://image.tmdb.org/t/p/w1280${item.backdrop_path}`}
                  alt=""
                  className="h-full w-full object-cover object-top"
                  loading={index === currentIndex ? "eager" : "lazy"}
                  fetchPriority={index === currentIndex ? "high" : "low"}
                  decoding="async"
                />
              )}
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
                className="max-w-[14rem] md:max-w-[22rem] max-h-[20vh] object-contain drop-shadow-lg bg-transparent mb-6"
                style={{ background: "none" }}
              />
            ) : (
              <h1 className="text-4xl md:text-6xl font-bold text-white mb-4">
                {mediaTitle}
              </h1>
            )}
            {/* Rating (IMDb) and year/seasons */}
            <div className="flex items-center gap-2 text-sm text-white/80 mb-4">
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
              onMouseEnter={() => setIsAutoPlaying(false)}
              onMouseLeave={() => setIsAutoPlaying(true)}
            >
              <button
                type="button"
                onClick={() =>
                  navigate(
                    `/media/tmdb-${currentMedia.type}-${currentMedia.id}-${mediaTitle?.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
                  )
                }
                className="tabbable cursor-pointer inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 w-full sm:w-auto text-base font-medium bg-pill-background bg-opacity-50 hover:bg-pill-backgroundHover backdrop-blur-lg transition-[transform,background-color] duration-100 hover:scale-105 active:scale-95"
              >
                <Icon icon={Icons.PLAY} className="text-white" />
                <span className="text-white">
                  {t("discover.featured.playNow")}
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
              <div className="hidden lg:block">
                <RandomMovieButton />
              </div>
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
