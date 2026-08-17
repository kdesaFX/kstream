import React, { useRef } from "react";
import { useTranslation } from "react-i18next";

import { Icons } from "@/components/Icon";
import { SectionHeading } from "@/components/layout/SectionHeading";
import { MediaCard } from "@/components/media/MediaCard";
import { useIsMobile } from "@/hooks/useIsMobile";
import { CarouselNavButtons } from "@/pages/discover/components/CarouselNavButtons";
import {
  MangaCarouselKind,
  useMangaDiscoverMedia,
} from "@/pages/discover/hooks/useMangaDiscoverMedia";
import { MediaItem } from "@/utils/media/mediaTypes";

function Skeleton() {
  return (
    <div className="relative mt-4 rounded-xl p-2 w-[10rem] md:w-[11.5rem]">
      <div className="animate-pulse">
        <div className="w-full aspect-[2/3] bg-mediaCard-hoverBackground rounded-lg" />
        <div className="mt-2 h-4 bg-mediaCard-hoverBackground rounded w-3/4" />
      </div>
    </div>
  );
}

export function MangaCarousel({
  kind,
  enabled,
  carouselRefs,
  onShowDetails,
}: {
  kind: MangaCarouselKind;
  enabled: boolean;
  carouselRefs: React.MutableRefObject<{
    [key: string]: HTMLDivElement | null;
  }>;
  onShowDetails?: (media: MediaItem) => void;
}) {
  const { t } = useTranslation();
  const { media, isLoading } = useMangaDiscoverMedia(kind, enabled);
  const { isMobile } = useIsMobile();
  const wheelLock = useRef(false);

  const title = t(`discover.carousel.title.manga.${kind}`);

  const handleWheel = (e: React.WheelEvent) => {
    if (wheelLock.current) return;
    const el = carouselRefs.current[kind];
    if (!el) return;
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault();
    wheelLock.current = true;
    el.scrollBy({ left: e.deltaY * 2, behavior: "smooth" });
    setTimeout(() => {
      wheelLock.current = false;
    }, 50);
  };

  if (!enabled) return null;

  return (
    <div className="relative">
      <SectionHeading title={title} icon={Icons.BOOKMARK} />
      <div className="relative">
        <div
          ref={(el) => {
            carouselRefs.current[kind] = el;
          }}
          className="grid grid-flow-col auto-cols-max gap-4 overflow-x-scroll scrollbar-hide pt-2 pb-4"
          onWheel={handleWheel}
        >
          {isLoading && media.length === 0
            ? Array.from({ length: 10 }).map((_, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <Skeleton key={i} />
              ))
            : media.map((item) => (
                <div
                  key={item.id}
                  className="relative mt-4 group cursor-pointer rounded-xl p-2 bg-transparent transition-colors duration-300 w-[10rem] md:w-[11.5rem] h-auto"
                >
                  <MediaCard
                    media={item}
                    linkable
                    onShowDetails={onShowDetails}
                  />
                </div>
              ))}
        </div>
        {!isMobile && (
          <CarouselNavButtons
            categorySlug={kind}
            carouselRefs={carouselRefs}
          />
        )}
      </div>
    </div>
  );
}
