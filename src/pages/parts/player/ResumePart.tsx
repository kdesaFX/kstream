import { useTranslation } from "react-i18next";

import { Button } from "@/components/buttons/Button";
import { Icon, Icons } from "@/components/Icon";
import { NextEpisodeButton } from "@/components/player/atoms/NextEpisodeButton";
import { PlayerStageMessage } from "@/components/player/internals/PlayerStageOverlay";
import { PlayerMeta } from "@/stores/player/slices/source";
import { usePlayerStore } from "@/stores/player/store";
import { getProgressPercentage, useProgressStore } from "@/stores/progress";

export interface ResumePartProps {
  onResume: () => void;
  onRestart: () => void;
  onMetaChange?: (meta: PlayerMeta) => void;
}

export function ResumePart(props: ResumePartProps) {
  const { t } = useTranslation();
  const meta = usePlayerStore((s) => s.meta);
  const progressItems = useProgressStore((s) => s.items);

  const watchPercentage = (() => {
    if (!meta?.tmdbId) return 0;

    const item = progressItems[meta.tmdbId];
    if (!item) return 0;

    if (meta.type === "movie") {
      if (!item.progress) return 0;
      return getProgressPercentage(
        item.progress.watched,
        item.progress.duration,
      );
    }

    if (meta.type === "show" && meta.episode?.tmdbId) {
      const episode = item.episodes?.[meta.episode.tmdbId];
      if (!episode) return 0;
      return getProgressPercentage(
        episode.progress.watched,
        episode.progress.duration,
      );
    }

    return 0;
  })();

  const roundedPercentage = Math.round(watchPercentage);
  const mediaTitle =
    meta?.type === "show" && meta.episode
      ? `${meta.title} · S${meta.season?.number ?? 1}E${meta.episode.number}`
      : meta?.title;

  return (
    <PlayerStageMessage
      poster={meta?.poster}
      mediaTitle={mediaTitle}
      badgeIcon={Icons.CLAPPER_BOARD}
      heading={t("player.resume.title")}
      body={t("player.resume.description", { percentage: roundedPercentage })}
    >
      <Button
        onClick={props.onResume}
        theme="purple"
        padding="md:px-12 p-2.5"
        className="w-full"
      >
        <Icon icon={Icons.PLAY} className="mr-2" />
        {t("player.resume.resume")}
      </Button>
      <Button
        onClick={props.onRestart}
        theme="secondary"
        padding="md:px-12 p-2.5"
        className="w-full"
      >
        <Icon icon={Icons.REPEAT} className="mr-2" />
        {t("player.resume.restart")}
      </Button>
      {meta?.type === "show" ? (
        <div className="flex justify-center">
          <NextEpisodeButton
            controlsShowing={false}
            onChange={props.onMetaChange}
            inControl
            showAsButton
          />
        </div>
      ) : null}
    </PlayerStageMessage>
  );
}
