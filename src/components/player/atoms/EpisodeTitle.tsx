import classNames from "classnames";
import { useTranslation } from "react-i18next";

import { useOverlayStack } from "@/stores/interface/overlayStack";
import { usePlayerStore } from "@/stores/player/store";

export function EpisodeTitle() {
  const { t } = useTranslation();
  const meta = usePlayerStore((s) => s.meta);
  const showSpeedIndicator = usePlayerStore(
    (s) => s.interface.showSpeedIndicator,
  );
  const currentOverlay = useOverlayStack((s) => s.currentOverlay);

  if (meta?.type !== "show") return null;

  // Centered speed/volume/subtitle toasts share this row — fade metadata out
  // while they're up so nothing stacks on top of Sx-Ex / episode title.
  const toastActive =
    (showSpeedIndicator && currentOverlay === "speed") ||
    currentOverlay === "volume" ||
    currentOverlay === "subtitle";

  return (
    <div
      className={classNames(
        "flex min-w-0 max-w-full items-center gap-3 transition-opacity duration-150",
        toastActive && "opacity-0",
      )}
      aria-hidden={toastActive || undefined}
    >
      <span className="text-white font-medium shrink-0">
        {t("media.episodeDisplay", {
          season: meta?.season?.number,
          episode: meta?.episode?.number,
        })}
      </span>
      <span className="text-type-secondary font-medium min-w-0 truncate">
        {meta?.episode?.title}
      </span>
    </div>
  );
}
