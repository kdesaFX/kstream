import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useWindowSize } from "react-use";

import {
  MediaType,
  useDiscoverOptions,
} from "@/pages/discover/hooks/useDiscoverMedia";
import { useDiscoverStore } from "@/stores/discover";

interface DiscoverNavigationProps {
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
}

const VISIBLE_GENRE_BREAKPOINT = 850;
const CATEGORIES = ["movies", "tvshows"] as const;

export function DiscoverNavigation({
  selectedCategory,
  onCategoryChange,
}: DiscoverNavigationProps) {
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowSize();
  const selectedGenreId = useDiscoverStore((s) => s.selectedGenreId);
  const setSelectedGenreId = useDiscoverStore((s) => s.setSelectedGenreId);
  const [genresExpanded, setGenresExpanded] = useState(false);

  const showGenreBar =
    selectedCategory === "movies" || selectedCategory === "tvshows";
  const mediaType: MediaType =
    selectedCategory === "tvshows" ? "tv" : "movie";
  const { genres } = useDiscoverOptions(mediaType);

  const visibleCount = windowWidth > VISIBLE_GENRE_BREAKPOINT ? 5 : 0;
  const hasOverflow = genres.length > visibleCount;
  const shownGenres = genresExpanded
    ? genres
    : genres.slice(0, visibleCount);

  // If a selected genre would be hidden while collapsed, expand so it stays visible.
  useEffect(() => {
    if (!selectedGenreId || !hasOverflow || genresExpanded) return;
    const index = genres.findIndex((g) => g.id.toString() === selectedGenreId);
    if (index >= visibleCount) setGenresExpanded(true);
  }, [
    selectedGenreId,
    genres,
    visibleCount,
    hasOverflow,
    genresExpanded,
  ]);

  // Collapse when switching Movies / TV so the bar resets.
  useEffect(() => {
    setGenresExpanded(false);
  }, [selectedCategory, mediaType]);

  const allSelected = selectedGenreId === null;
  // Selected chips must sit above the page black — mediaCard-background
  // matches the page and makes the active pill look "missing".
  const chipActive = "bg-white/20 text-white ring-1 ring-white/25";
  const chipIdle =
    "bg-mediaCard-hoverBackground text-type-secondary hover:bg-white/10";

  return (
    <div className="pb-4 w-full max-w-screen-xl mx-auto">
      <div className="relative flex justify-center">
        <div className="flex space-x-4">
          {CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              className={`text-xl md:text-2xl font-bold p-2 bg-transparent text-center rounded-full cursor-pointer flex items-center transition-transform duration-200 ${
                selectedCategory === category
                  ? "transform scale-105 text-type-link"
                  : "text-type-secondary"
              }`}
              onClick={() => onCategoryChange(category)}
            >
              {t(`discover.tabs.${category}`)}
            </button>
          ))}
        </div>
      </div>

      {showGenreBar && (
        <div className="flex items-center justify-center gap-2 mt-3 px-4 flex-wrap">
          <button
            type="button"
            onClick={() => setSelectedGenreId(null)}
            className={`px-3 py-1 text-sm rounded-full transition-colors whitespace-nowrap flex-shrink-0 ${
              allSelected ? chipActive : chipIdle
            }`}
          >
            {t("discover.genres.all")}
          </button>
          {shownGenres.map((genre) => {
            const id = genre.id.toString();
            const active = selectedGenreId === id;
            return (
              <button
                type="button"
                key={id}
                onClick={() => setSelectedGenreId(id)}
                className={`px-3 py-1 text-sm rounded-full transition-colors whitespace-nowrap flex-shrink-0 ${
                  active ? chipActive : chipIdle
                }`}
              >
                {genre.name}
              </button>
            );
          })}
          {hasOverflow && (
            <button
              type="button"
              onClick={() => setGenresExpanded((v) => !v)}
              className="px-2 py-1 text-sm font-medium text-type-link hover:text-white transition-colors whitespace-nowrap flex-shrink-0"
            >
              {genresExpanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
