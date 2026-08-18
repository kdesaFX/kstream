import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { MediaCard } from "@/components/media/MediaCard";
import { useIntersectionObserver } from "@/hooks/useIntersectionObserver";
import { useIsMobile } from "@/hooks/useIsMobile";
import { CarouselNavButtons } from "@/pages/discover/components/CarouselNavButtons";
import { useDedupedMangaCarouselMedia } from "@/pages/discover/components/useDedupedMangaCarouselMedia";
import {
  MangaCarouselKind,
  useMangaDiscoverMedia,
} from "@/pages/discover/hooks/useMangaDiscoverMedia";
import { MediaItem } from "@/utils/media/mediaTypes";

const SKELETON_COUNT = 10;
const EAGER_CARDS = 8;
const CARD_WRAPPER =
  "relative mt-4 group cursor-pointer user-select-none rounded-xl p-2 bg-transparent transition-colors duration-300 w-[10rem] md:w-[11.5rem] h-auto";

export function MangaCarousel({
  kind,
  enabled,
  carouselRefs,
  onShowDetails,
  priority = false,
  dedupePriority,
}: {
  kind: MangaCarouselKind;
  enabled: boolean;
  carouselRefs: React.MutableRefObject<{
    [key: string]: HTMLDivElement | null;
  }>;
  onShowDetails?: (media: MediaItem) => void;
  /** First rows fetch immediately; later rows wait until they are near the viewport. */
  priority?: boolean;
  dedupePriority?: number;
}) {
  const { t } = useTranslation();
  const { ref: lazyRef, hasIntersected } =
    useIntersectionObserver<HTMLDivElement>({
      threshold: 0.01,
      rootMargin: "400px",
    });
  const [visibleLoad, setVisibleLoad] = useState(false);
  const shouldFetch =
    enabled && (priority || hasIntersected || visibleLoad);
  const { media: rawMedia, hasLoaded, error } = useMangaDiscoverMedia(
    kind,
    shouldFetch,
  );
  const media = useDedupedMangaCarouselMedia(dedupePriority, rawMedia, {
    enabled: shouldFetch,
    hasLoaded,
    kind,
  });
  const { isMobile } = useIsMobile();
  const isScrollingRef = useRef(false);
  const browser = !!window.chrome;

  // display:none on inactive tabs breaks IntersectionObserver — recheck when
  // the manga tab becomes visible so rows below the fold still load.
  useEffect(() => {
    if (!enabled || priority || hasIntersected) return;
    const el = lazyRef.current;
    if (!el) return;
    const check = () => {
      const rect = el.getBoundingClientRect();
      if (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.top < window.innerHeight + 400
      ) {
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

        {!isMobile && media.length > 0 && (
          <CarouselNavButtons
            categorySlug={categorySlug}
            carouselRefs={carouselRefs}
          />
        )}
      </div>
    </div>
  );
}
