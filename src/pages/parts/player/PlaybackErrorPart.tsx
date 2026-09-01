import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

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
import {
  detectPlaybackEnv,
  hasProvenZeroHit,
} from "@/utils/media/sourceOrder";

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
  const navigate = useNavigate();
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
  const isPaused = usePlayerStore((s) => s.mediaPlaying.isPaused);
  // Real watch progress — not hasPlayedOnce. The HTML `play` event (and a
  // stuck flag from the previous episode) used to look like "viewer paused a
  // working stream" and freeze auto-resume on StreamStartTimeout forever.
  const watchedSeconds = usePlayerStore((s) => s.progress.time);
  const viewerPausedWorkingStream = isPaused && watchedSeconds > 2;

  // Mark the failed source/embed and handle UI when a playback error occurs
  useEffect(() => {
    if (playbackError && currentSourceId) {
      // Only mark source/embed as failed for fatal errors
      const isFatalError =
        playbackError.type === "hls"
          ? (playbackError.hls?.fatal ?? false)
          : playbackError.type === "htmlvideo";

      if (isFatalError) {
        const playbackCtx = {
          env: detectPlaybackEnv(),
          mediaType:
            meta?.type === "show" ? ("show" as const) : ("movie" as const),
          meta,
        };
        const skipMirrors =
          currentSourceId != null &&
          hasProvenZeroHit(currentSourceId, playbackCtx);
        if (
          !currentEmbedId &&
          !skipMirrors &&
          usePlayerStore.getState().tryShiftSourceMirror()
        ) {
          return;
        }
        if (currentEmbedId) {
          // Multi-mirror sources (e.g. TQQ quints) must not ban the whole source
          // after one/two bad mirrors — only mark the mirror itself failed.
          addFailedEmbed(currentSourceId, currentEmbedId);
        } else {
          addFailedSource(currentSourceId);
        }

        // Drop title/global pins immediately on fatal fail — even while
        // auto-resume keeps hunting. Otherwise a scrape-or-once-working
        // preferred source keeps locking every episode onto a dead stream.
        if (meta?.tmdbId) {
          const preferred =
            usePreferencesStore.getState().preferredSourceByTitle[
              meta.tmdbId
            ];
          if (preferred === currentSourceId) {
            clearPreferredSourceForTitle(meta.tmdbId);
          }
        }
        const lastSuccessfulSource =
          usePreferencesStore.getState().lastSuccessfulSource;
        if (currentSourceId && lastSuccessfulSource === currentSourceId) {
          setLastSuccessfulSource(null);
        }
      }

      if (!hasOpenedSettings.current && (!enableAutoResumeOnPlaybackError || props.autoResumeExhausted)) {
        hasOpenedSettings.current = true;
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

  /**
   * Whether the effect below is going to send us straight back to scraping.
   * Mirrors its guard exactly, so we never hide the error without a retry
   * actually being on the way.
   */
  const willAutoResume = Boolean(
    playbackError &&
      enableAutoResumeOnPlaybackError &&
      !props.autoResumeExhausted &&
      props.currentSourceId &&
      !viewerPausedWorkingStream &&
      (props.onRetrySource || props.onResume),
  );

  // Automatically resume scraping if enabled
  useEffect(() => {
    if (
      playbackError &&
      !hasAutoResumed.current &&
      enableAutoResumeOnPlaybackError &&
      !props.autoResumeExhausted &&
      props.currentSourceId &&
      !viewerPausedWorkingStream
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
    viewerPausedWorkingStream,
  ]);

  const handleOpenSourcePicker = () => {
    settingsRouter.open();
    settingsRouter.navigate("/source");
  };

  // Trying the next source is recovery, not an outcome. Announcing a failure
  // we're about to paper over just flashes a full-screen error between the
  // dead stream and the search that replaces it, which reads as "it broke"
  // rather than "still working on it". Stay dark until the searcher is back.
  if (willAutoResume) return null;

  return (
    <ErrorLayout>
      <ErrorContainer>
        <IconPill icon={Icons.WAND}>{t("player.playbackError.badge")}</IconPill>
        <Title>{t("player.playbackError.title")}</Title>
        <Paragraph>
          {enableAutoResumeOnPlaybackError &&
          !props.autoResumeExhausted &&
          !viewerPausedWorkingStream
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
            theme="secondary"
            padding="md:px-12 p-2.5"
            className="mt-6"
            onClick={() => {
              try {
                usePlayerStore.getState().reset();
              } catch {
                // still leave
              }
              navigate("/", { replace: true });
            }}
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
