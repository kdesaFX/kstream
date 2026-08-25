import { useAutoAnimate } from "@formkit/auto-animate/react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/buttons/Button";
import { EditButton } from "@/components/buttons/EditButton";
import { Icon, Icons } from "@/components/Icon";
import { SectionHeading } from "@/components/layout/SectionHeading";
import { WideContainer } from "@/components/layout/WideContainer";
import { MediaGrid } from "@/components/media/MediaGrid";
import { ReadMediaCard } from "@/components/media/ReadMediaCard";
import { Heading1 } from "@/components/utils/Text";
import { useRandomTranslation } from "@/hooks/useRandomTranslation";
import { SubPageLayout } from "@/pages/layouts/SubPageLayout";
import { HomeAd } from "@/pages/parts/home/HomeAd";
import { useOverlayStack } from "@/stores/interface/overlayStack";
import {
  shouldShowMangaProgress,
  useMangaProgressStore,
} from "@/stores/mangaProgress";
import { MediaItem } from "@/utils/media/mediaTypes";

interface ReadHistoryProps {
  onShowDetails?: (media: MediaItem) => void;
}

export function ReadHistory({ onShowDetails }: ReadHistoryProps) {
  const { t } = useTranslation();
  const { t: randomT } = useRandomTranslation();
  const emptyText = randomT(`home.search.empty`);
  const navigate = useNavigate();
  const progressItems = useMangaProgressStore((s) => s.items);
  const removeItem = useMangaProgressStore((s) => s.removeItem);
  const [editing, setEditing] = useState(false);
  const [gridRef] = useAutoAnimate<HTMLDivElement>();
  const { showModal } = useOverlayStack();

  const handleShowDetails = async (media: MediaItem) => {
    if (onShowDetails) {
      onShowDetails(media);
      return;
    }
    showModal("manga-details", {
      id: String(media.id),
      mangaId: String(media.id),
      type: "manga",
    });
  };

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

    output.sort((a, b) => {
      const aItem = progressItems[a.id];
      const bItem = progressItems[b.id];
      return (bItem?.updatedAt ?? 0) - (aItem?.updatedAt ?? 0);
    });

    return output;
  }, [progressItems]);

  if (items.length === 0) {
    return (
      <SubPageLayout>
        <WideContainer>
          <div className="flex flex-col items-center justify-center translate-y-1/2">
            <p className="text-[18.5px] pb-3">{emptyText}</p>
            <Button
              theme="purple"
              onClick={() => navigate("/")}
              className="mt-4"
            >
              {t("notFound.goHome")}
            </Button>
          </div>
        </WideContainer>
      </SubPageLayout>
    );
  }

  return (
    <SubPageLayout>
      <WideContainer>
        <div className="flex items-center justify-between gap-8">
          <Heading1 className="text-2xl font-bold text-white">
            {t("home.readHistory.sectionTitle")}
          </Heading1>
        </div>

        <div className="flex items-center gap-4 pb-8">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="flex items-center text-white hover:text-gray-300 transition-colors"
          >
            <Icon icon={Icons.ARROW_LEFT} className="text-xl" />
            <span className="ml-2">{t("discover.page.back")}</span>
          </button>
        </div>

        <SectionHeading
          title={t("home.readHistory.recentlyRead")}
          icon={Icons.BOOK}
        >
          <div className="flex items-center gap-2">
            <EditButton
              editing={editing}
              onEdit={setEditing}
              id="edit-button-read-history"
            />
          </div>
        </SectionHeading>

        <MediaGrid ref={gridRef}>
          {items.map((v) => (
            <div
              key={v.id}
              style={{ userSelect: "none" }}
              onContextMenu={(e: React.MouseEvent<HTMLDivElement>) =>
                e.preventDefault()
              }
            >
              <ReadMediaCard
                media={v}
                closable={editing}
                onClose={() => removeItem(String(v.id))}
                onShowDetails={handleShowDetails}
              />
            </div>
          ))}
        </MediaGrid>

        <div className="w-full flex justify-center my-10 px-4">
          <HomeAd slot="history" />
        </div>
      </WideContainer>
    </SubPageLayout>
  );
}
