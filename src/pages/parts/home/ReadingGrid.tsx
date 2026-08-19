import { useAutoAnimate } from "@formkit/auto-animate/react";
import { Popover, Transition } from "@headlessui/react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { OptionItem } from "@/components/form/Dropdown";
import { Icon, Icons } from "@/components/Icon";
import { SectionHeading } from "@/components/layout/SectionHeading";
import { MediaGrid } from "@/components/media/MediaGrid";
import { ReadMediaCard } from "@/components/media/ReadMediaCard";
import { useMediaGridColumns } from "@/hooks/useMediaGridColumns";
import { MoreCard } from "@/pages/parts/home/BookmarksGrid";
import {
  shouldShowMangaProgress,
  useMangaProgressStore,
} from "@/stores/mangaProgress";
import { usePreferencesStore } from "@/stores/preferences";
import { SortOption, sortMediaItems } from "@/utils/media/mediaSorting";
import { MediaItem } from "@/utils/media/mediaTypes";

export function ReadingGrid({
  onItemsChange,
  onShowDetails,
}: {
  onItemsChange: (hasItems: boolean) => void;
  onShowDetails?: (media: MediaItem) => void;
}) {
  const { t } = useTranslation();
  const progressItems = useMangaProgressStore((s) => s.items);
  const removeItem = useMangaProgressStore((s) => s.removeItem);
  const [editing, setEditing] = useState(false);

  const [sortBy, setSortBy] = useState<SortOption>(() => {
    const saved = localStorage.getItem("__MW::readingSort");
    return (saved as SortOption) || "date";
  });

  const readingRowsToShow = usePreferencesStore((s) => s.readingRowsToShow);
  const setReadingRowsToShow = usePreferencesStore(
    (s) => s.setReadingRowsToShow,
  );
  const columns = useMediaGridColumns();
  const [gridRef, enableAnimations] = useAutoAnimate<HTMLDivElement>();

  useEffect(() => {
    if (editing) {
      enableAnimations(true);
      return;
    }
    enableAnimations(true);
    const timeout = setTimeout(() => enableAnimations(false), 500);
    return () => clearTimeout(timeout);
  }, [readingRowsToShow, editing, enableAnimations]);

  useEffect(() => {
    localStorage.setItem("__MW::readingSort", sortBy);
  }, [sortBy]);

  const sortProgress = useMemo(() => {
    const out: Record<string, { updatedAt: number }> = {};
    for (const [id, item] of Object.entries(progressItems)) {
      out[id] = { updatedAt: item.updatedAt };
    }
    return out;
  }, [progressItems]);

  const sortedProgressItems = useMemo(() => {
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

  useEffect(() => {
    onItemsChange(sortedProgressItems.length > 0);
  }, [sortedProgressItems, onItemsChange]);

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
    { id: "year-asc", name: t("home.continueReading.sorting.options.yearAsc") },
    {
      id: "year-desc",
      name: t("home.continueReading.sorting.options.yearDesc"),
    },
  ];

  if (sortedProgressItems.length === 0) return null;

  const maxItems = readingRowsToShow * columns;
  const totalItems = sortedProgressItems.length;

  let displayMedia = sortedProgressItems;
  let showViewAll = false;

  if (!editing && totalItems > maxItems) {
    showViewAll = true;
    displayMedia = sortedProgressItems.slice(0, maxItems - 1);
  }

  return (
    <div className="relative">
      <SectionHeading
        title={t("home.continueReading.sectionTitle")}
        icon={Icons.BOOKMARK}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditing(!editing)}
            className={`flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-colors ${
              editing
                ? "bg-type-link text-white shadow-lg shadow-type-link/20"
                : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
            }`}
          >
            {editing ? (
              <>
                <Icon icon={Icons.CHECKMARK} className="text-lg" />
                <span>Done</span>
              </>
            ) : (
              <>
                <Icon icon={Icons.EDIT} className="text-lg" />
                <span className="hidden sm:inline">Edit</span>
              </>
            )}
          </button>
          <Popover className="relative">
            {({ open }) => (
              <>
                <Popover.Button
                  className={`p-2 rounded-full transition-colors outline-none focus:ring-2 focus:ring-type-link ${open ? "bg-white/20 text-white" : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"}`}
                >
                  <Icon icon={Icons.SETTINGS} className="text-xl" />
                </Popover.Button>
                <Transition
                  as={Fragment}
                  enter="transition ease-out duration-200"
                  enterFrom="opacity-0 translate-y-1"
                  enterTo="opacity-100 translate-y-0"
                  leave="transition ease-in duration-150"
                  leaveFrom="opacity-100 translate-y-0"
                  leaveTo="opacity-0 translate-y-1"
                >
                  <Popover.Panel className="absolute right-full top-full mt-2 w-64 z-50 rounded-xl bg-dropdown-background p-4 shadow-lg ring-1 ring-white/10 select-none">
                    <div className="space-y-4">
                      <div className="flex gap-2 text-sm font-medium text-white">
                        <span className="flex-1 whitespace-nowrap">
                          Rows to show
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            disabled={readingRowsToShow === 1}
                            onClick={() =>
                              setReadingRowsToShow(readingRowsToShow - 1)
                            }
                            className="flex h-6 w-6 items-center justify-center rounded-md bg-white/10 transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            -
                          </button>
                          <span className="w-5 text-center tabular-nums">
                            {readingRowsToShow}
                          </span>
                          <button
                            type="button"
                            disabled={readingRowsToShow === 10}
                            onClick={() =>
                              setReadingRowsToShow(readingRowsToShow + 1)
                            }
                            className="flex h-6 w-6 items-center justify-center rounded-md bg-white/10 transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <div className="border-t border-white/10" />
                      <label className="block text-sm font-medium text-white mb-2">
                        Sort By
                      </label>
                      <div className="bg-background-secondaryHover rounded-lg overflow-hidden flex flex-col">
                        {sortOptions.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              const newSort = opt.id as SortOption;
                              setSortBy(newSort);
                              localStorage.setItem(
                                "__MW::readingSort",
                                newSort,
                              );
                            }}
                            className={`
                                w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between
                                ${
                                  sortBy === opt.id
                                    ? "text-type-emphasis"
                                    : "text-type-text hover:bg-white/5 hover:text-type-emphasis"
                                }`}
                          >
                            <span>{opt.name}</span>
                            {sortBy === opt.id && (
                              <Icon
                                icon={Icons.CHECKMARK}
                                className="text-type-link"
                              />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  </Popover.Panel>
                </Transition>
              </>
            )}
          </Popover>
        </div>
      </SectionHeading>

      <MediaGrid ref={gridRef}>
        {displayMedia.map((v) => (
          <div
            key={v.id}
            onContextMenu={(e: React.MouseEvent<HTMLDivElement>) =>
              e.preventDefault()
            }
          >
            <ReadMediaCard
              media={v}
              closable={editing}
              onClose={() => removeItem(String(v.id))}
              onShowDetails={onShowDetails}
            />
          </div>
        ))}
        {showViewAll && (
          <div key="view-all-reading">
            <MoreCard
              link="/read-history"
              className="relative group cursor-pointer user-select-none rounded-xl bg-transparent transition-colors duration-300 w-full h-full"
            />
          </div>
        )}
      </MediaGrid>
    </div>
  );
}
