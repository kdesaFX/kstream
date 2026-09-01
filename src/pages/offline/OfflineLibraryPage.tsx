import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate } from "react-router-dom";

import {
  deleteDesktopVideoDownload,
  listDesktopVideoDownloads,
  type VideoOfflineItem,
} from "@/backend/video/videoDesktopOffline";
import { Button } from "@/components/buttons/Button";
import { Icon, Icons } from "@/components/Icon";
import { WideContainer } from "@/components/layout/WideContainer";
import { Heading1 } from "@/components/utils/Text";
import { isDesktopApp } from "@/hooks/useIsDesktopApp";
import { SubPageLayout } from "@/pages/layouts/SubPageLayout";

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function OfflineVideoCard({
  item,
  onRefresh,
}: {
  item: VideoOfflineItem;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const [playing, setPlaying] = useState(false);

  const statusLabel =
    item.status === "ready"
      ? t("offlineLibrary.ready")
      : item.status === "error"
        ? t("offlineLibrary.error")
        : t("offlineLibrary.downloading");

  return (
    <div className="rounded-xl bg-mediaCard-hoverBackground/40 border border-mediaCard-hoverStroke p-4 flex gap-4">
      <div className="w-24 shrink-0 aspect-[2/3] rounded-lg overflow-hidden bg-mediaCard-hoverBackground">
        {item.poster ? (
          <img
            src={item.poster}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-type-secondary">
            <Icon icon={Icons.FILM} className="text-3xl" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-type-main truncate">{item.title}</p>
        <p className="text-sm text-type-secondary mt-1">
          {statusLabel}
          {item.fileSize ? ` · ${formatBytes(item.fileSize)}` : null}
        </p>
        {item.error ? (
          <p className="text-xs text-type-danger mt-1 break-words">{item.error}</p>
        ) : null}
        <div className="flex flex-wrap gap-2 mt-3">
          {item.status === "ready" && item.playbackUrl ? (
            <Button
              theme="purple"
              onClick={() => setPlaying((v) => !v)}
            >
              {playing ? t("offlineLibrary.stop") : t("offlineLibrary.play")}
            </Button>
          ) : null}
          <Button
            theme="secondary"
            onClick={async () => {
              await deleteDesktopVideoDownload(item.id);
              onRefresh();
            }}
          >
            {t("offlineLibrary.delete")}
          </Button>
        </div>
        {playing && item.playbackUrl ? (
          <video
            key={item.playbackUrl}
            src={item.playbackUrl}
            controls
            autoPlay
            className="w-full mt-3 rounded-lg bg-black max-h-[50vh]"
          />
        ) : null}
      </div>
    </div>
  );
}

export function OfflineLibraryPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState<VideoOfflineItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const next = await listDesktopVideoDownloads();
    setItems(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  if (!isDesktopApp()) {
    return <Navigate to="/" replace />;
  }

  return (
    <SubPageLayout>
      <WideContainer>
        <div className="flex items-center gap-3 mb-8">
          <button
            type="button"
            className="text-type-secondary hover:text-type-main transition-colors"
            onClick={() => navigate(-1)}
          >
            <Icon icon={Icons.ARROW_LEFT} className="text-xl" />
          </button>
          <Heading1>{t("offlineLibrary.title")}</Heading1>
        </div>

        {loading ? (
          <p className="text-type-secondary">{t("offlineLibrary.loading")}</p>
        ) : items.length === 0 ? (
          <p className="text-type-secondary max-w-xl">{t("offlineLibrary.empty")}</p>
        ) : (
          <div className="flex flex-col gap-4 max-w-3xl">
            {items.map((item) => (
              <OfflineVideoCard key={item.id} item={item} onRefresh={refresh} />
            ))}
          </div>
        )}
      </WideContainer>
    </SubPageLayout>
  );
}
