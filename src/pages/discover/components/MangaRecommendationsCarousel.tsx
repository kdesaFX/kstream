import { Listbox } from "@headlessui/react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Dropdown } from "@/components/form/Dropdown";
import { Icon, Icons } from "@/components/Icon";
import { MediaCard } from "@/components/media/MediaCard";
import { useIntersectionObserver } from "@/hooks/useIntersectionObserver";
import { useIsMobile } from "@/hooks/useIsMobile";
import { CarouselNavButtons } from "@/pages/discover/components/CarouselNavButtons";
import { useDedupedMangaCarouselMedia } from "@/pages/discover/components/useDedupedMangaCarouselMedia";
import { useMangaRecommendations } from "@/pages/discover/hooks/useMangaRecommendations";
import { useDiscoverStore } from "@/stores/discover";
import type { MangaProgressItem } from "@/stores/mangaProgress";
import type { MediaItem } from "@/utils/media/mediaTypes";

const SKELETON_COUNT = 10;
const EAGER_CARDS = 8;
const CARD_WRAPPER =
  "relative mt-4 group cursor-pointer user-select-none rounded-xl p-2 bg-transparent transition-colors duration-300 w-[10rem] md:w-[11.5rem] h-auto";

export function MangaRecommendationsCarousel({
  sources,
  enabled,
  priority = false,
  carouselRefs,
  onShowDetails,
  dedupePriority,
}: {
  sources: Array<{ id: string; item: MangaProgressItem }>;
  enabled: boolean;
  priority?: boolean;
  carouselRefs: React.MutableRefObject<{
    [key: string]: HTMLDivElement | null;
  }>;
  onShowDetails?: (media: MediaItem) => void;
  dedupePriority?: number;
}) {
  const { t } = useTranslation();
  const { isMobile } = useIsMobile();
  const browser = !!window.chrome;
  const recommendationSeeds = useDiscoverStore((s) => s.recommendationSeeds);
  const setRecommendationSeed = useDiscoverStore((s) => s.setRecommendationSeed);
  const [selectedId, setSelectedId] = useState("");
  const [selectedTitle, setSelectedTitle] = useState("");
  const isScrollingRef = useRef(false);

  const sortedSources = useMemo(
    () =>
      [...sources].sort(
        (a, b) => (b.item.updatedAt ?? 0) - (a.item.updatedAt ?? 0),
      ),
    [sources],
  );

  const { ref: lazyRef, hasIntersected } =
    useIntersectionObserver<HTMLDivElement>({
      threshold: 0.01,
      rootMargin: "400px",
    });
  const [visibleLoad, setVisibleLoad] = useState(false);

  useEffect(() => {
    if (!enabled || priority || hasIntersected) return;
    const el = lazyRef.current;
    if (!el) return;
    const check = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight + 400) {
        setVisibleLoad(true);
      }
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check, { passive: true });
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [enabled, priority, hasIntersected, lazyRef]);

  const shouldFetch =
    enabled &&
    sortedSources.length > 0 &&
    (priority || hasIntersected || visibleLoad);

  useEffect(() => {
    if (sortedSources.length === 0 || selectedId) return;
    const mostRecent = sortedSources[0]!;
    const persisted = recommendationSeeds.manga;
    const persistedStill = persisted
      ? sortedSources.find((s) => s.id === persisted.id)
      : undefined;
    const useManual =
      Boolean(persisted?.manual && persistedStill) &&
      (persistedStill?.item.updatedAt ?? 0) >= (mostRecent.item.updatedAt ?? 0);
    const pick = useManual && persistedStill ? persistedStill : mostRecent;
    setSelectedId(pick.id);
    setSelectedTitle(pick.item.title);
    if (
      persisted?.id !== pick.id ||
      persisted?.title !== pick.item.title ||
      persisted?.manual !== useManual
    ) {
      setRecommendationSeed("manga", {
        id: pick.id,
        title: pick.item.title,
        manual: useManual,
      });
    }
  }, [
    sortedSources,
    selectedId,
    recommendationSeeds.manga,
    setRecommendationSeed,
  ]);

  const selectedSource = useMemo(
    () => sortedSources.find((s) => s.id === selectedId),
    [sortedSources, selectedId],
  );

  const { media: rawMedia, sectionTitle, hasLoaded, error, isLoading } =
    useMangaRecommendations(
      selectedId,
      selectedTitle,
      selectedSource?.item.tags,
      shouldFetch,
    );

  const { media, isBackfilling } = useDedupedMangaCarouselMedia(dedupePriority, rawMedia, {
    enabled: shouldFetch,
    hasLoaded,
    isLoading,
    kind: "recommendations",
  });
  const categorySlug = "manga-because-you-read";

  const recommendationOptions = useMemo(
    () => sortedSources.map((s) => ({ id: s.id, name: s.item.title })),
    [sortedSources],
  );

  const selectedItem = useMemo(
    () => ({ id: selectedId, name: selectedTitle }),
    [selectedId, selectedTitle],
  );

  const handleWheel = React.useCallback(
    (e: React.WheelEvent) => {
      if (isScrollingRef.current) return;
      isScrollingRef.current = true;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.stopPropagation();
        e.preventDefault();
      }
      if (browser) {
        setTimeout(() => {
          isScrollingRef.current = false;
        }, 345);
      } else {
        isScrollingRef.current = false;
      }
    },
    [browser],
  );

  if (!enabled || sources.length === 0) return null;

  if (!shouldFetch) {
    return <div ref={lazyRef} className="h-[20rem]" />;
  }

  const shouldHide =
    hasLoaded &&
    !isLoading &&
    !isBackfilling &&
    media.length === 0 &&
    (Boolean(error) || rawMedia.length === 0);
  if (shouldHide) return null;

  return (
    <div ref={lazyRef}>
      <div className="flex items-center justify-between px-4 mt-2">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl cursor-default font-bold text-white md:text-2xl pl-0 text-balance">
            {sectionTitle || t("discover.carousel.title.manga.recommended", { title: selectedTitle })}
          </h2>
          {sortedSources.length > 1 ? (
            <div className="relative pr-4">
              <Dropdown
                selectedItem={selectedItem}
                setSelectedItem={(item) => {
                  setSelectedId(item.id);
                  setSelectedTitle(item.name);
                  setRecommendationSeed("manga", {
                    id: item.id,
                    title: item.name,
                    manual: true,
                  });
                }}
                options={recommendationOptions}
                customButton={
                  <button
                    type="button"
                    className="px-2 py-1 text-sm bg-mediaCard-hoverBackground rounded-full hover:bg-mediaCard-background transition-colors flex items-center gap-1"
                  >
                    <span>{t("discover.carousel.change")}</span>
                    <Icon
                      icon={Icons.UP_DOWN_ARROW}
                      className="text-xs text-dropdown-secondary"
                    />
                  </button>
                }
                side="right"
                customMenu={
                  <Listbox.Options static className="py-1">
                    {recommendationOptions.map((opt) => (
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
          ) : null}
        </div>
      </div>

      <div className="relative overflow-hidden carousel-container md:pb-4">
        <div
          id={`carousel-${categorySlug}`}
          className="grid grid-flow-col auto-cols-max gap-4 pt-0 overflow-x-scroll scrollbar-none rounded-xl overflow-y-hidden px-4"
          ref={(el) => {
            carouselRefs.current[categorySlug] = el;
          }}
          onWheel={handleWheel}
        >
          {media.length > 0
            ? media.map((item, index) => (
                <div
                  onContextMenu={(e) => e.preventDefault()}
                  key={item.id}
                  className={CARD_WRAPPER}
                >
                  <MediaCard
                    linkable
                    eager={index < EAGER_CARDS}
                    media={item}
                    onShowDetails={onShowDetails}
                  />
                </div>
              ))
            : isLoading || !hasLoaded
              ? Array(SKELETON_COUNT)
                  .fill(null)
                  .map((_, index) => (
                    <div
                      key={`skeleton-${categorySlug}-${index}`}
                      className={CARD_WRAPPER}
                    >
                      <MediaCard
                        media={{
                          id: `skeleton-${index}`,
                          title: "",
                          poster: "",
                          type: "manga",
                        }}
                        forceSkeleton
                      />
                    </div>
                  ))
              : null}
        </div>

        {!isMobile && media.length > 0 ? (
          <CarouselNavButtons
            categorySlug={categorySlug}
            carouselRefs={carouselRefs}
          />
        ) : null}
      </div>
    </div>
  );
}
