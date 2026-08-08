import classNames from "classnames";
import { useEffect, useRef, useState, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { useWindowSize } from "react-use";

import { Icon, Icons } from "@/components/Icon";
import {
  MediaType,
  useDiscoverOptions,
} from "@/pages/discover/hooks/useDiscoverMedia";
import { getGenreIcon } from "@/pages/discover/lib/genreIcons";
import { useDiscoverStore } from "@/stores/discover";

interface DiscoverNavigationProps {
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
}

const VISIBLE_GENRE_BREAKPOINT = 850;
const CATEGORIES = ["movies", "tvshows"] as const;

const chipBase =
  "flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium tracking-wide whitespace-nowrap shrink-0 select-none transition-all duration-200 ease-out-quint hover:-translate-y-0.5 active:translate-y-0 active:scale-95";

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
  const [genresExpanded, setGenresExpanded] = useState(false);
  const selectedChipRef = useRef<HTMLButtonElement>(null);

  const showGenreBar =
    selectedCategory === "movies" || selectedCategory === "tvshows";
  const mediaType: MediaType =
    selectedCategory === "tvshows" ? "tv" : "movie";
  const { genres } = useDiscoverOptions(mediaType);

  const visibleCount = windowWidth > VISIBLE_GENRE_BREAKPOINT ? 5 : 0;
  const hasOverflow = genres.length > visibleCount;
  const primaryGenres = genres.slice(0, visibleCount);
  const overflowGenres = genres.slice(visibleCount);

  const selectedGenre = genres.find(
    (genre) => genre.id.toString() === selectedGenreId,
  );
  const inGenreView = Boolean(selectedGenreId && selectedGenre);

  // If a selected genre would be hidden while collapsed, expand so it stays visible.
  useEffect(() => {
    if (!selectedGenreId || !hasOverflow || genresExpanded || inGenreView) return;
    const index = genres.findIndex((g) => g.id.toString() === selectedGenreId);
    if (index >= visibleCount) setGenresExpanded(true);
  }, [
    selectedGenreId,
    genres,
    visibleCount,
    hasOverflow,
    genresExpanded,
    inGenreView,
  ]);

  // Collapse when switching Movies / TV so the bar resets.
  useEffect(() => {
    setGenresExpanded(false);
  }, [selectedCategory, mediaType]);

  // Keep the active genre chip in view on the horizontal bar.
  useEffect(() => {
    if (!inGenreView) return;
    selectedChipRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [inGenreView, selectedGenreId]);

  const allSelected = selectedGenreId === null;

  const renderGenreChip = (
    genre: { id: number; name: string },
    options?: { chipRef?: Ref<HTMLButtonElement> },
  ) => {
    const id = genre.id.toString();
    const active = selectedGenreId === id;
    return (
      <button
        type="button"
        key={id}
        ref={options?.chipRef}
        onClick={() => setSelectedGenreId(id)}
        className={classNames(chipBase, active ? chipActive : chipIdle)}
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
  };

  if (inGenreView && selectedGenre) {
    const genreTitle =
      mediaType === "movie"
        ? t("discover.carousel.title.genreMovies", {
            genre: selectedGenre.name,
          })
        : t("discover.carousel.title.genreShows", {
            genre: selectedGenre.name,
          });

    return (
      <div className="pb-4 w-full max-w-screen-xl mx-auto px-4">
        <button
          type="button"
          onClick={() => setSelectedGenreId(null)}
          className="flex items-center text-white hover:text-gray-300 transition-colors mb-4"
        >
          <Icon icon={Icons.ARROW_LEFT} className="text-xl" />
          <span className="ml-2">{t("discover.page.back")}</span>
        </button>

        <h1 className="text-2xl md:text-3xl font-bold text-white mb-4">
          {genreTitle}
        </h1>

        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-2 -mx-4 px-4 sm:mx-0 sm:px-0">
          {genres.map((genre) =>
            renderGenreChip(genre, {
              chipRef:
                genre.id.toString() === selectedGenreId
                  ? selectedChipRef
                  : undefined,
            }),
          )}
        </div>
      </div>
    );
  }

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
        <div className="mt-3 px-4">
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
            {primaryGenres.map((genre) => renderGenreChip(genre))}
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

          {hasOverflow && (
            <div
              className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
                genresExpanded
                  ? "grid-rows-[1fr] opacity-100"
                  : "grid-rows-[0fr] opacity-0"
              }`}
            >
              <div className="overflow-hidden min-h-0">
                <div className="flex items-center justify-center gap-2 flex-wrap pt-2">
                  {overflowGenres.map((genre) => {
                    const id = genre.id.toString();
                    const active = selectedGenreId === id;
                    return (
                      <button
                        type="button"
                        key={id}
                        onClick={() => setSelectedGenreId(id)}
                        tabIndex={genresExpanded ? 0 : -1}
                        className={classNames(
                          chipBase,
                          active ? chipActive : chipIdle,
                          genresExpanded ? "translate-y-0" : "translate-y-1",
                          "transition-[transform,background-color,border-color,color,box-shadow] duration-300 ease-out",
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
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
