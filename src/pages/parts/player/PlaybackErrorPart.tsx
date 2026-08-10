import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/buttons/Button";
import { Icons } from "@/components/Icon";
import { IconPill } from "@/components/layout/IconPill";
import { useModal } from "@/components/overlays/Modal";
import { Paragraph } from "@/components/text/Paragraph";
import { Title } from "@/components/text/Title";
import { useOverlayRouter } from "@/hooks/useOverlayRouter";
import { ErrorContainer, ErrorLayout } from "@/pages/layouts/ErrorLayout";
import { usePlayerStore } from "@/stores/player/store";
import { usePreferencesStore } from "@/stores/preferences";

import { ErrorCardInModal } from "../errors/ErrorCard";

export interface PlaybackErrorPartProps {
  onResume?: (startFromSourceId: string) => void;
  /** Re-scrape without skipping the current multi-embed source (next mirror). */
  onRetrySource?: () => void;
  currentSourceId?: string | null;
  autoResumeExhausted?: boolean;
}

export function PlaybackErrorPart(props: PlaybackErrorPartProps) {
  const { t } = useTranslation();
  const playbackError = usePlayerStore((s) => s.interface.error);
  const currentSourceId = usePlayerStore((s) => s.sourceId);
  const currentEmbedId = usePlayerStore((s) => s.embedId);
  const meta = usePlayerStore((s) => s.meta);
  const addFailedSource = usePlayerStore((s) => s.addFailedSource);
  const addFailedEmbed = usePlayerStore((s) => s.addFailedEmbed);
  const modal = useModal("error");
  const settingsRouter = useOverlayRouter("settings");
  const hasOpenedSettings = useRef(false);
  const hasAutoResumed = useRef(false);
  const setLastSuccessfulSource = usePreferencesStore(
    (s) => s.setLastSuccessfulSource,
  );
  const clearPreferredSourceForTitle = usePreferencesStore(
    (s) => s.clearPreferredSourceForTitle,
  );
  const enableAutoResumeOnPlaybackError = usePreferencesStore(
    (s) => s.enableAutoResumeOnPlaybackError,
  );

  // Mark the failed source/embed and handle UI when a playback error occurs
  useEffect(() => {
    if (playbackError && currentSourceId) {
      // Only mark source/embed as failed for fatal errors
      const isFatalError =
        playbackError.type === "hls"
          ? (playbackError.hls?.fatal ?? false)
          : playbackError.type === "htmlvideo";

      if (isFatalError) {
        if (currentEmbedId) {
          // Multi-mirror sources (e.g. TQQ quints) must not ban the whole source
          // after one/two bad mirrors — only mark the mirror itself failed.
          addFailedEmbed(currentSourceId, currentEmbedId);
        } else {
          addFailedSource(currentSourceId);
        }
      }

      if (!hasOpenedSettings.current && (!enableAutoResumeOnPlaybackError || props.autoResumeExhausted)) {
        hasOpenedSettings.current = true;
        // Forget this title's pin so the next try can move on.
        // Only clear the global fallback if it was the source that just failed.
        if (meta?.tmdbId) {
          clearPreferredSourceForTitle(meta.tmdbId);
        }
        const lastSuccessfulSource =
          usePreferencesStore.getState().lastSuccessfulSource;
        if (currentSourceId && lastSuccessfulSource === currentSourceId) {
          setLastSuccessfulSource(null);
        }
        settingsRouter.open();
        settingsRouter.navigate("/source");
      }
    }
  }, [
    playbackError,
    currentSourceId,
    currentEmbedId,
    meta,
    addFailedSource,
    addFailedEmbed,
    settingsRouter,
    setLastSuccessfulSource,
    clearPreferredSourceForTitle,
    enableAutoResumeOnPlaybackError,
    props.autoResumeExhausted,
  ]);

  // Automatically resume scraping if enabled
  useEffect(() => {
    if (
      playbackError &&
      !hasAutoResumed.current &&
      enableAutoResumeOnPlaybackError &&
      !props.autoResumeExhausted &&
      props.currentSourceId
    ) {
      hasAutoResumed.current = true;
      if (currentEmbedId && props.onRetrySource) {
        // Same source, next mirror/embed (failed embed already recorded)
        props.onRetrySource();
      } else if (props.onResume) {
        // No embed context — skip this source entirely
        props.onResume(props.currentSourceId);
      }
    }
  }, [
    playbackError,
    enableAutoResumeOnPlaybackError,
    props.autoResumeExhausted,
    props.currentSourceId,
    props.onResume,
    props.onRetrySource,
    currentEmbedId,
  ]);

  const handleOpenSourcePicker = () => {
    settingsRouter.open();
    settingsRouter.navigate("/source");
  };

  return (
    <ErrorLayout>
      <ErrorContainer>
        <IconPill icon={Icons.WAND}>{t("player.playbackError.badge")}</IconPill>
        <Title>{t("player.playbackError.title")}</Title>
        <Paragraph>
          {enableAutoResumeOnPlaybackError && !props.autoResumeExhausted
            ? t("player.playbackError.autoResumeText")
            : t("player.playbackError.text")}
        </Paragraph>
        <div className="flex gap-3">
          {props.currentSourceId &&
            props.onResume &&
            (!enableAutoResumeOnPlaybackError || props.autoResumeExhausted) && (
              <Button
                onClick={() => props.onResume!(props.currentSourceId!)}
                theme="purple"
                padding="md:px-12 p-2.5"
                className="mt-6"
              >
                {t("player.playbackError.resumeButton")}
              </Button>
            )}
          <Button
            onClick={handleOpenSourcePicker}
            theme="purple"
            padding="md:px-12 p-2.5"
            className="mt-6"
          >
            {t("player.menus.sources.title")}
          </Button>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={() => modal.show()}
            theme="danger"
            padding="md:px-12 p-2.5"
            className="mt-6"
          >
            {t("errors.showError")}
          </Button>
        </div>
        <div className="flex gap-3">
          <Button
            href="/"
            theme="secondary"
            padding="md:px-12 p-2.5"
            className="mt-6"
          >
            {t("player.playbackError.homeButton")}
          </Button>
          <Button
            theme="secondary"
            padding="md:px-12 p-2.5"
            className="mt-6"
            onClick={(e) => {
              e.preventDefault();
              window.location.reload();
            }}
          >
            {t("errors.reloadPage")}
          </Button>
        </div>
      </ErrorContainer>
      {/* Error */}
      <ErrorCardInModal
        onClose={() => modal.hide()}
        error={playbackError}
        id={modal.id}
      />
    </ErrorLayout>
  );
}
