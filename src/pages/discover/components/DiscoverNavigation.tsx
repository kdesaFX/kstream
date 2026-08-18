import classNames from "classnames";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useWindowSize } from "react-use";

import { MANGA_DISCOVER_GENRES } from "@/backend/manga/mangaTags";
import { Icon, Icons } from "@/components/Icon";
import {
  MediaType,
  useDiscoverOptions,
} from "@/pages/discover/hooks/useDiscoverMedia";
import { getGenreIcon } from "@/pages/discover/lib/genreIcons";
import { useDiscoverStore } from "@/stores/discover";
import { usePreferencesStore } from "@/stores/preferences";

interface DiscoverNavigationProps {
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
}

const VISIBLE_GENRE_BREAKPOINT = 850;
const CATEGORIES = ["movies", "tvshows", "manga"] as const;

const chipBase =
  "flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium tracking-wide whitespace-nowrap shrink-0 select-none transition-all duration-300 ease-out-quint hover:-translate-y-0.5 active:translate-y-0 active:scale-95";

const chipIdle =
  "bg-search-background/40 backdrop-blur-md hover:bg-search-hoverBackground/80 text-type-secondary hover:text-white border border-white/10 hover:border-white/20";

const chipActive =
  "bg-white text-black border border-white shadow-[0_0_18px_2px_rgba(255,255,255,0.55)] hover:bg-white hover:text-black";

const chipToggle =
  "bg-search-background/60 backdrop-blur-md hover:bg-search-hoverBackground text-type-secondary hover:text-white border border-white/35 hover:border-white/55 min-w-[5.5rem] justify-center";

export function DiscoverNavigation({
  selectedCategory,
  onCategoryChange,
}: DiscoverNavigationProps) {
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowSize();
  const selectedGenreId = useDiscoverStore((s) => s.selectedGenreId);
  const setSelectedGenreId = useDiscoverStore((s) => s.setSelectedGenreId);
  const enableMangaDiscover = usePreferencesStore((s) => s.enableMangaDiscover);
  const [genresExpanded, setGenresExpanded] = useState(false);

  const showGenreBar = CATEGORIES.includes(
    selectedCategory as (typeof CATEGORIES)[number],
  );
  const mediaType: MediaType =
    selectedCategory === "tvshows" ? "tv" : "movie";
  const { genres: mediaGenres } = useDiscoverOptions(mediaType);
  const genres =
    selectedCategory === "manga" ? MANGA_DISCOVER_GENRES : mediaGenres;
  const tabs = CATEGORIES.filter(
    (c) => c !== "manga" || enableMangaDiscover,
  );

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

  // Collapse when switching content type so the bar resets.
  useEffect(() => {
    setGenresExpanded(false);
  }, [selectedCategory, mediaType]);

  const allSelected = selectedGenreId === null;

  return (
    <div className="pb-4 w-full max-w-screen-xl mx-auto">
      <div className="relative flex justify-center">
        <div className="flex space-x-4">
          {tabs.map((category) => (
            <button
              key={category}
              type="button"
              className={`text-xl md:text-2xl font-bold p-2 bg-transparent text-center rounded-full cursor-pointer flex items-center transition-colors duration-200 ${
                selectedCategory === category
                  ? "text-type-link"
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
        <div className="mt-3 px-4">
          {/* Single wrapping flex so More/Less always follows the last visible genre. */}
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setSelectedGenreId(null)}
              className={classNames(
                chipBase,
                allSelected ? chipActive : chipIdle,
              )}
            >
              <Icon
                icon={Icons.RISING_STAR}
                className={classNames(
                  "text-[14px]",
                  allSelected ? "opacity-90 text-black" : "opacity-70",
                )}
              />
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
                  className={classNames(
                    chipBase,
                    active ? chipActive : chipIdle,
                  )}
                >
                  <Icon
                    icon={getGenreIcon(genre.name)}
                    className={classNames(
                      "text-[14px]",
                      active ? "opacity-90 text-black" : "opacity-70",
                    )}
                  />
                  {genre.name}
                </button>
              );
            })}

            {hasOverflow && (
              <button
                type="button"
                onClick={() => setGenresExpanded((v) => !v)}
                className={classNames(chipBase, chipToggle)}
                aria-expanded={genresExpanded}
              >
                <Icon
                  icon={genresExpanded ? Icons.CHEVRON_UP : Icons.PLUS}
                  className="text-[14px]"
                />
                {genresExpanded ? "Less" : "More"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
