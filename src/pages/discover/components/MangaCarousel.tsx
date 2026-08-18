import React, { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";

import { MediaCard } from "@/components/media/MediaCard";
import { useIntersectionObserver } from "@/hooks/useIntersectionObserver";
import { useIsMobile } from "@/hooks/useIsMobile";
import { CarouselNavButtons } from "@/pages/discover/components/CarouselNavButtons";
import {
  MangaCarouselKind,
  useMangaDiscoverMedia,
} from "@/pages/discover/hooks/useMangaDiscoverMedia";
import { MediaItem } from "@/utils/media/mediaTypes";

const SKELETON_COUNT = 10;
const EAGER_CARDS = 8;
// Matches the movie/TV rows so a manga row lines up with the ones above it.
const CARD_WRAPPER =
  "relative mt-4 group cursor-pointer user-select-none rounded-xl p-2 bg-transparent transition-colors duration-300 w-[10rem] md:w-[11.5rem] h-auto";

export function MangaCarousel({
  kind,
  enabled,
  carouselRefs,
  onShowDetails,
  priority = false,
}: {
  kind: MangaCarouselKind;
  enabled: boolean;
  carouselRefs: React.MutableRefObject<{
    [key: string]: HTMLDivElement | null;
  }>;
  onShowDetails?: (media: MediaItem) => void;
  /** First rows fetch immediately; later rows wait until they are near the viewport. */
  priority?: boolean;
}) {
  const { t } = useTranslation();
  const { ref: lazyRef, hasIntersected } =
    useIntersectionObserver<HTMLDivElement>({
      threshold: 0.1,
      rootMargin: "50px",
    });
  const shouldFetch = enabled && (priority || hasIntersected);
  const { media, hasLoaded, error } = useMangaDiscoverMedia(kind, shouldFetch);
  const { isMobile } = useIsMobile();
  const isScrollingRef = useRef(false);
  const browser = !!window.chrome;

  const categorySlug = `manga-${kind}`;
  const title = t(`discover.carousel.title.manga.${kind}`);

  const handleWheel = useCallback(
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

  if (!enabled) return null;

  if (!shouldFetch) {
    return <div ref={lazyRef} className="h-[20rem]" />;
  }

  // Same rule as the movie rows: a row that resolved to nothing shouldn't
  // leave a bare heading and a pair of arrows behind.
  if (hasLoaded && (error || media.length === 0)) return null;

  return (
    <div ref={lazyRef}>
      <div className="flex items-center justify-between px-4 mt-2">
        <h2 className="text-2xl cursor-default font-bold text-white md:text-2xl pl-0 text-balance">
          {title}
        </h2>
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
                  onContextMenu={(e: React.MouseEvent<HTMLDivElement>) =>
                    e.preventDefault()
                  }
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
            : Array(SKELETON_COUNT)
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
                ))}
        </div>

        {!isMobile && (
          <CarouselNavButtons
            categorySlug={categorySlug}
            carouselRefs={carouselRefs}
          />
        )}
      </div>
    </div>
  );
}
