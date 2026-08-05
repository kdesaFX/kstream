import { Listbox } from "@headlessui/react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useWindowSize } from "react-use";

import { Dropdown } from "@/components/form/Dropdown";
import { Icon, Icons } from "@/components/Icon";
import {
  MediaType,
  useDiscoverOptions,
} from "@/pages/discover/hooks/useDiscoverMedia";
import { useDiscoverStore } from "@/stores/discover";

interface DiscoverNavigationProps {
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  /** Only offer the "For You" tab once there's a taste profile to draw on. */
  showForYou?: boolean;
}

const VISIBLE_GENRE_BREAKPOINT = 850;

export function DiscoverNavigation({
  selectedCategory,
  onCategoryChange,
  showForYou,
}: DiscoverNavigationProps) {
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowSize();
  const selectedGenreId = useDiscoverStore((s) => s.selectedGenreId);
  const setSelectedGenreId = useDiscoverStore((s) => s.setSelectedGenreId);

  const categories = showForYou
    ? ["foryou", "movies", "tvshows"]
    : ["movies", "tvshows"];

  const showGenreBar =
    selectedCategory === "movies" || selectedCategory === "tvshows";
  const mediaType: MediaType =
    selectedCategory === "tvshows" ? "tv" : "movie";
  const { genres } = useDiscoverOptions(mediaType);

  const visibleCount = windowWidth > VISIBLE_GENRE_BREAKPOINT ? 5 : 0;
  const visibleGenres = genres.slice(0, visibleCount);
  const overflowGenres = genres.slice(visibleCount);

  const allSelected = selectedGenreId === null;
  const selectedOverflow = useMemo(() => {
    if (!selectedGenreId) return null;
    return overflowGenres.find((g) => g.id.toString() === selectedGenreId);
  }, [overflowGenres, selectedGenreId]);

  return (
    <div className="pb-4 w-full max-w-screen-xl mx-auto">
      <div className="relative flex justify-center">
        <div className="flex space-x-4">
          {categories.map((category) => (
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
              allSelected
                ? "bg-mediaCard-background text-white"
                : "bg-mediaCard-hoverBackground text-type-secondary hover:bg-mediaCard-background"
            }`}
          >
            {t("discover.genres.all")}
          </button>
          {visibleGenres.map((genre) => {
            const id = genre.id.toString();
            const active = selectedGenreId === id;
            return (
              <button
                type="button"
                key={id}
                onClick={() => setSelectedGenreId(id)}
                className={`px-3 py-1 text-sm rounded-full transition-colors whitespace-nowrap flex-shrink-0 ${
                  active
                    ? "bg-mediaCard-background text-white"
                    : "bg-mediaCard-hoverBackground text-type-secondary hover:bg-mediaCard-background"
                }`}
              >
                {genre.name}
              </button>
            );
          })}
          {overflowGenres.length > 0 && (
            <Dropdown
              selectedItem={
                selectedOverflow
                  ? {
                      id: selectedOverflow.id.toString(),
                      name: selectedOverflow.name,
                    }
                  : { id: "", name: "…" }
              }
              setSelectedItem={(item) => {
                if (item.id) setSelectedGenreId(item.id);
              }}
              options={overflowGenres.map((g) => ({
                id: g.id.toString(),
                name: g.name,
              }))}
              customButton={
                <button
                  type="button"
                  className={`px-3 py-1 text-sm rounded-full transition-colors whitespace-nowrap flex-shrink-0 flex items-center gap-1 ${
                    selectedOverflow
                      ? "bg-mediaCard-background text-white"
                      : "bg-mediaCard-hoverBackground text-type-secondary hover:bg-mediaCard-background"
                  }`}
                >
                  <span>{selectedOverflow ? selectedOverflow.name : "…"}</span>
                  <Icon
                    icon={Icons.UP_DOWN_ARROW}
                    className="text-xs text-dropdown-secondary"
                  />
                </button>
              }
              side="right"
              customMenu={
                <Listbox.Options static className="py-1 max-h-72 overflow-y-auto">
                  {overflowGenres.map((g) => (
                    <Listbox.Option
                      className={({ active }) =>
                        `cursor-pointer min-w-48 flex gap-4 items-center relative select-none py-2 px-4 mx-1 rounded-lg ${
                          active
                            ? "bg-background-secondaryHover text-type-link"
                            : "text-type-secondary"
                        }`
                      }
                      key={g.id}
                      value={{ id: g.id.toString(), name: g.name }}
                    >
                      {({ selected }) => (
                        <>
                          <span
                            className={`block ${selected || selectedGenreId === g.id.toString() ? "font-medium text-white" : "font-normal"}`}
                          >
                            {g.name}
                          </span>
                          {(selected ||
                            selectedGenreId === g.id.toString()) && (
                            <Icon
                              icon={Icons.CHECKMARK}
                              className="text-xs text-type-link"
                            />
                          )}
                        </>
                      )}
                    </Listbox.Option>
                  ))}
                </Listbox.Options>
              }
            />
          )}
        </div>
      )}
    </div>
  );
}
