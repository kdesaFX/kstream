import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { chapterBadge } from "@/backend/manga/mangadex";
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

const CATEGORY_SLUG = "continue-reading";

export function ReadingCarousel({ carouselRefs }: ReadingCarouselProps) {
  const { t } = useTranslation();
  const { isMobile } = useIsMobile();
  const browser = !!window.chrome;
  let isScrolling = false;
  // Same reasoning as Continue Watching: editing is a moment, not a preference.
  const [editing, setEditing] = useState(false);
  const items = useMangaProgressStore((s) => s.items);
  const removeItem = useMangaProgressStore((s) => s.removeItem);
  const { showModal } = useOverlayStack();

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

  if (mediaItems.length === 0) return null;

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
      <div className="relative overflow-hidden carousel-container md:pb-4">
        <div
          id={`carousel-${CATEGORY_SLUG}`}
          className="grid grid-flow-col auto-cols-max gap-4 pt-0 overflow-x-scroll scrollbar-none rounded-xl overflow-y-hidden px-4"
          ref={(el) => {
            carouselRefs.current[CATEGORY_SLUG] = el;
          }}
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
                onContextMenu={(e: React.MouseEvent<HTMLDivElement>) =>
                  e.preventDefault()
                }
                className="relative mt-4 group cursor-pointer rounded-xl p-2 bg-transparent transition-colors duration-300 w-[10rem] md:w-[11.5rem] h-auto"
              >
                <MediaCard
                  media={media}
                  linkable
                  percentage={pct}
                  badge={chapterBadge(item.chapterLabel)}
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
              </div>
            );
          })}
        </div>

        {!isMobile ? (
          <CarouselNavButtons
            categorySlug={CATEGORY_SLUG}
            carouselRefs={carouselRefs}
          />
        ) : null}
      </div>
    </>
  );
}
