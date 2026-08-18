import { Listbox } from "@headlessui/react";
import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { EditButton } from "@/components/buttons/EditButton";
import { Dropdown, OptionItem } from "@/components/form/Dropdown";
import { Icon, Icons } from "@/components/Icon";
import { SectionHeading } from "@/components/layout/SectionHeading";
import { ReadMediaCard } from "@/components/media/ReadMediaCard";
import { useIsMobile } from "@/hooks/useIsMobile";
import { CarouselNavButtons } from "@/pages/discover/components/CarouselNavButtons";
import {
  shouldShowMangaProgress,
  useMangaProgressStore,
} from "@/stores/mangaProgress";
import { SortOption, sortMediaItems } from "@/utils/media/mediaSorting";
import { MediaItem } from "@/utils/media/mediaTypes";

interface ReadingCarouselProps {
  carouselRefs: React.MutableRefObject<{
    [key: string]: HTMLDivElement | null;
  }>;
  onShowDetails?: (media: MediaItem) => void;
}

function MediaCardSkeleton() {
  return (
    <div className="relative mt-4 group cursor-default rounded-xl p-2 bg-transparent transition-colors duration-300 w-[10rem] md:w-[11.5rem] h-auto">
      <div className="animate-pulse">
        <div className="w-full aspect-[2/3] bg-mediaCard-hoverBackground rounded-lg" />
        <div className="mt-2 h-4 bg-mediaCard-hoverBackground rounded w-3/4" />
      </div>
    </div>
  );
}

export function ReadingCarousel({
  carouselRefs,
  onShowDetails,
}: ReadingCarouselProps) {
  const { t } = useTranslation();
  const browser = !!window.chrome;
  let isScrolling = false;
  const [editing, setEditing] = useState(false);

  const [sortBy, setSortBy] = useState<SortOption>(() => {
    const saved = localStorage.getItem("__MW::readingSort");
    return (saved as SortOption) || "date";
  });
  const removeItem = useMangaProgressStore((s) => s.removeItem);

  useEffect(() => {
    localStorage.setItem("__MW::readingSort", sortBy);
  }, [sortBy]);

  const { isMobile } = useIsMobile();

  const progressItems = useMangaProgressStore((s) => s.items);

  const itemsLength = useMemo(
    () =>
      Object.values(progressItems).filter((item) =>
        shouldShowMangaProgress(item),
      ).length,
    [progressItems],
  );

  const sortProgress = useMemo(() => {
    const out: Record<string, { updatedAt: number }> = {};
    for (const [id, item] of Object.entries(progressItems)) {
      out[id] = { updatedAt: item.updatedAt };
    }
    return out;
  }, [progressItems]);

  const items = useMemo(() => {
    const output: MediaItem[] = [];
    Object.entries(progressItems)
      .filter(([, item]) => shouldShowMangaProgress(item))
      .forEach(([id, item]) => {
        output.push({
          id,
          title: item.title,
          poster: item.poster,
          year: item.year,
          type: "manga",
        });
      });
    return sortMediaItems(
      output,
      sortBy,
      undefined,
      sortProgress as Record<string, never>,
    );
  }, [progressItems, sortBy, sortProgress]);

  const handleWheel = (e: React.WheelEvent) => {
    if (isScrolling) return;
    isScrolling = true;

    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      e.stopPropagation();
      e.preventDefault();
    }

    if (browser) {
      setTimeout(() => {
        isScrolling = false;
      }, 345);
    } else {
      isScrolling = false;
    }
  };

  const sortOptions: OptionItem[] = [
    { id: "date", name: t("home.continueReading.sorting.options.date") },
    {
      id: "title-asc",
      name: t("home.continueReading.sorting.options.titleAsc"),
    },
    {
      id: "title-desc",
      name: t("home.continueReading.sorting.options.titleDesc"),
    },
    {
      id: "year-asc",
      name: t("home.continueReading.sorting.options.yearAsc"),
    },
    {
      id: "year-desc",
      name: t("home.continueReading.sorting.options.yearDesc"),
    },
  ];

  const selectedSortOption =
    sortOptions.find((opt) => opt.id === sortBy) || sortOptions[0];

  const categorySlug = "continue-reading";
  const SKELETON_COUNT = 10;

  if (itemsLength === 0) return null;

  return (
    <>
      <SectionHeading
        title={t("home.continueReading.sectionTitle")}
        icon={Icons.BOOKMARK}
        className="px-4 mt-2 -mb-5"
      >
        <div className="mr-4 lg:mr-[88px] flex items-center gap-2">
          <EditButton
            editing={editing}
            onEdit={setEditing}
            id="edit-button-reading"
          />
        </div>
      </SectionHeading>
      {editing && (
        <div className="mt-4 -mb-4 px-4">
          <Dropdown
            selectedItem={selectedSortOption}
            setSelectedItem={(item) => {
              const newSort = item.id as SortOption;
              setSortBy(newSort);
              localStorage.setItem("__MW::readingSort", newSort);
            }}
            options={sortOptions}
            customButton={
              <button
                type="button"
                className="px-2 py-1 text-sm bg-mediaCard-hoverBackground rounded-full hover:bg-mediaCard-background transition-colors flex items-center gap-1"
              >
                <span>{selectedSortOption.name}</span>
                <Icon
                  icon={Icons.UP_DOWN_ARROW}
                  className="text-xs text-dropdown-secondary"
                />
              </button>
            }
            side="left"
            customMenu={
              <Listbox.Options static className="py-1">
                {sortOptions.map((opt) => (
                  <Listbox.Option
                    className={({ active }) =>
                      `cursor-pointer min-w-60 flex gap-4 items-center relative select-none py-2 px-4 mx-1 rounded-lg ${
                        active
                          ? "bg-background-secondaryHover text-type-link"
                          : "text-type-secondary"
                      }`
                    }
                    key={opt.id}
                    value={opt}
                  >
                    {({ selected }) => (
                      <>
                        <span
                          className={`block ${selected ? "font-medium" : "font-normal"}`}
                        >
                          {opt.name}
                        </span>
                        {selected && (
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
        </div>
      )}
      <div className="relative overflow-hidden carousel-container md:pb-4">
        <div
          id={`carousel-${categorySlug}`}
          className="grid grid-flow-col auto-cols-max gap-4 pt-0 overflow-x-scroll scrollbar-none rounded-xl overflow-y-hidden px-4"
          ref={(el) => {
            carouselRefs.current[categorySlug] = el;
          }}
          onWheel={handleWheel}
        >
          {items.length > 0
            ? items.map((media) => (
                <div
                  key={media.id}
                  onContextMenu={(e: React.MouseEvent<HTMLDivElement>) =>
                    e.preventDefault()
                  }
                  className="relative mt-4 group cursor-pointer rounded-xl p-2 bg-transparent transition-colors duration-300 w-[10rem] md:w-[11.5rem] h-auto"
                >
                  <ReadMediaCard
                    media={media}
                    onShowDetails={onShowDetails}
                    closable={editing}
                    onClose={() => removeItem(String(media.id))}
                  />
                </div>
              ))
            : Array.from({ length: SKELETON_COUNT }).map((_, index) => (
                <MediaCardSkeleton
                  key={`skeleton-${categorySlug}-${index}`}
                />
              ))}
        </div>

        {!isMobile && (
          <CarouselNavButtons
            categorySlug={categorySlug}
            carouselRefs={carouselRefs}
          />
        )}
      </div>
    </>
  );
}
