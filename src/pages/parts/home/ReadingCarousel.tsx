import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { EditButton } from "@/components/buttons/EditButton";
import { Icons } from "@/components/Icon";
import { SectionHeading } from "@/components/layout/SectionHeading";
import { MediaCard } from "@/components/media/MediaCard";
import { useIsMobile } from "@/hooks/useIsMobile";
import { CarouselNavButtons } from "@/pages/discover/components/CarouselNavButtons";
import { useOverlayStack } from "@/stores/interface/overlayStack";
import {
  shouldShowMangaProgress,
  useMangaProgressStore,
} from "@/stores/mangaProgress";
import { MediaItem } from "@/utils/media/mediaTypes";

interface ReadingCarouselProps {
  carouselRefs: React.MutableRefObject<{
    [key: string]: HTMLDivElement | null;
  }>;
}

export function ReadingCarousel({ carouselRefs }: ReadingCarouselProps) {
  const { t } = useTranslation();
  const { isMobile } = useIsMobile();
  const [editing, setEditing] = useState(false);
  const items = useMangaProgressStore((s) => s.items);
  const removeItem = useMangaProgressStore((s) => s.removeItem);
  const { showModal } = useOverlayStack();
  let isScrolling = false;

  const mediaItems = useMemo(() => {
    return Object.entries(items)
      .filter(([, item]) => shouldShowMangaProgress(item))
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
      .map(([id, item]) => ({
        id,
        title: item.title,
        poster: item.poster,
        chapterLabel: item.chapterLabel,
        page: item.page,
        totalPages: item.totalPages,
      }));
  }, [items]);

  if (mediaItems.length === 0) return null;

  const handleWheel = (e: React.WheelEvent) => {
    if (isScrolling) return;
    const el = carouselRefs.current.reading;
    if (!el) return;
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault();
    isScrolling = true;
    el.scrollBy({ left: e.deltaY * 2, behavior: "smooth" });
    setTimeout(() => {
      isScrolling = false;
    }, 50);
  };

  return (
    <div className="relative">
      <SectionHeading
        title={t("home.continueReading.sectionTitle")}
        icon={Icons.BOOKMARK}
      >
        <div className="flex items-center gap-2">
          <EditButton editing={editing} onEdit={setEditing} />
        </div>
      </SectionHeading>
      <div className="relative">
        <div
          ref={(el) => {
            carouselRefs.current.reading = el;
          }}
          className="grid grid-flow-col auto-cols-max gap-4 overflow-x-scroll scrollbar-hide pt-2 pb-4"
          onWheel={handleWheel}
        >
          {mediaItems.map((item) => {
            const media: MediaItem = {
              id: item.id,
              title: item.title,
              poster: item.poster,
              type: "manga",
            };
            const pct =
              item.totalPages > 0
                ? Math.round(((item.page + 1) / item.totalPages) * 100)
                : 0;
            return (
              <div
                key={item.id}
                className="relative mt-4 w-[10rem] md:w-[11.5rem]"
              >
                <MediaCard
                  media={media}
                  linkable
                  percentage={pct}
                  closable={editing}
                  onClose={editing ? () => removeItem(item.id) : undefined}
                  onShowDetails={() =>
                    showModal("manga-details", {
                      id: item.id,
                      mangaId: item.id,
                      type: "manga",
                    })
                  }
                />
                <p className="mt-1 px-2 text-xs text-type-secondary truncate">
                  {item.chapterLabel}
                </p>
              </div>
            );
          })}
        </div>
        {!isMobile ? (
          <CarouselNavButtons
            categorySlug="reading"
            carouselRefs={carouselRefs}
          />
        ) : null}
      </div>
    </div>
  );
}
