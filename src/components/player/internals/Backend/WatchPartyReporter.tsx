/* eslint-disable no-console */
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { sendPlayerStatus } from "@/backend/player/status";
import { usePlayerStatusPolling } from "@/components/player/hooks/usePlayerStatusPolling";
import { useBackendUrl } from "@/hooks/auth/useBackendUrl";
import { useWatchPartySync } from "@/hooks/useWatchPartySync";
import { useAuthStore } from "@/stores/auth";
import { usePlayerStore } from "@/stores/player/store";
import { useWatchPartyStore } from "@/stores/watchParty";

const VALIDATION_EVENT = "watchparty:validation";
export const emitValidationStatus = (success: boolean) => {
  window.dispatchEvent(
    new CustomEvent(VALIDATION_EVENT, { detail: { success } }),
  );
};

const HOST_REPORT_INTERVAL_MS = 1500;
const GUEST_REPORT_INTERVAL_MS = 3000;

export function WatchPartyReporter() {
  const { latestStatus } = usePlayerStatusPolling(5);
  const lastReportTime = useRef<number>(0);
  const lastReportedFingerprint = useRef<string>("");
  const followedTargetRef = useRef<string | null>(null);
  const navigate = useNavigate();

  const account = useAuthStore((s) => s.account);
  const userId = account?.userId || "guest";
  const backendUrl = useBackendUrl();

  const meta = usePlayerStore((s) => s.meta);

  const {
    enabled: watchPartyEnabled,
    roomCode,
    isHost,
  } = useWatchPartyStore();

  const { hostUser } = useWatchPartySync();

  useEffect(() => {
    if (!watchPartyEnabled) {
      followedTargetRef.current = null;
    }
  }, [watchPartyEnabled]);

  useEffect(() => {
    if (
      !watchPartyEnabled ||
      !roomCode ||
      isHost ||
      !hostUser ||
      !hostUser.content.tmdbId
    )
      return;

    const hostTmdbId = hostUser.content.tmdbId;
    const hostSeasonId = hostUser.content.seasonId;
    const hostEpisodeId = hostUser.content.episodeId;
    const isHostTv = hostUser.content.type === "TV Show";

    const currentTmdbId = meta?.tmdbId ? parseInt(meta.tmdbId, 10) : null;
    const currentSeasonId = meta?.season?.tmdbId
      ? parseInt(meta.season.tmdbId, 10)
      : undefined;
    const currentEpisodeId = meta?.episode?.tmdbId
      ? parseInt(meta.episode.tmdbId, 10)
      : undefined;

    const targetKey = isHostTv
      ? `tv:${hostTmdbId}:${hostSeasonId}:${hostEpisodeId}`
      : `movie:${hostTmdbId}`;

    const isOnSameContent =
      currentTmdbId === hostTmdbId &&
      (!isHostTv ||
        (currentSeasonId === hostSeasonId &&
          currentEpisodeId === hostEpisodeId));

    if (isOnSameContent) {
      followedTargetRef.current = targetKey;
      emitValidationStatus(true);
      return;
    }

    if (followedTargetRef.current === targetKey) return;
    followedTargetRef.current = targetKey;

    const targetPath =
      isHostTv && hostSeasonId && hostEpisodeId
        ? `/media/tmdb-tv-${hostTmdbId}/${hostSeasonId}/${hostEpisodeId}`
        : `/media/tmdb-movie-${hostTmdbId}`;

    const url = new URL(targetPath, window.location.origin);
    url.searchParams.set("watchparty", roomCode);
    navigate(url.pathname + url.search);
  }, [
    watchPartyEnabled,
    roomCode,
    isHost,
    hostUser,
    meta?.tmdbId,
    meta?.season?.tmdbId,
    meta?.episode?.tmdbId,
    meta?.type,
    navigate,
  ]);

  useEffect(() => {
    if (
      !watchPartyEnabled ||
      !latestStatus ||
      !latestStatus.hasPlayedOnce ||
      !roomCode ||
      !meta
    )
      return;

    const now = Date.now();
    const fingerprint = JSON.stringify({
      isPlaying: latestStatus.isPlaying,
      isPaused: latestStatus.isPaused,
      isLoading: latestStatus.isLoading,
      time: Math.floor(latestStatus.time),
      playbackRate: latestStatus.playbackRate,
    });

    const changed = fingerprint !== lastReportedFingerprint.current;
    const minInterval = isHost
      ? HOST_REPORT_INTERVAL_MS
      : GUEST_REPORT_INTERVAL_MS;
    const dueByTime = now - lastReportTime.current >= minInterval;
    const dueByChange = changed && now - lastReportTime.current >= 250;

    if (!dueByChange && !dueByTime) return;

    let contentTitle = "Unknown content";
    let contentType = "Unknown";
    if (meta.type === "movie") {
      contentTitle = meta.title;
      contentType = "Movie";
    } else if (meta.type === "show" && meta.episode) {
      contentTitle = `${meta.title} - S${meta.season?.number || 0}E${meta.episode.number || 0}`;
      contentType = "TV Show";
    }

    const send = async () => {
      try {
        await sendPlayerStatus(backendUrl, account, {
          userId,
          roomCode,
          isHost,
          content: {
            title: contentTitle,
            type: contentType,
            tmdbId: meta?.tmdbId ? Number(meta.tmdbId) : 0,
            seasonId: meta?.season?.tmdbId
              ? Number(meta.season.tmdbId)
              : undefined,
            episodeId: meta?.episode?.tmdbId
              ? Number(meta.episode.tmdbId)
              : undefined,
            seasonNumber: meta?.season?.number,
            episodeNumber: meta?.episode?.number,
          },
          player: {
            isPlaying: latestStatus.isPlaying,
            isPaused: latestStatus.isPaused,
            isLoading: latestStatus.isLoading,
            hasPlayedOnce: latestStatus.hasPlayedOnce,
            time: latestStatus.time,
            duration: latestStatus.duration,
            playbackRate: latestStatus.playbackRate,
            buffered: latestStatus.buffered,
          },
        });
        lastReportTime.current = now;
        lastReportedFingerprint.current = fingerprint;
      } catch (err) {
        console.error("watchparty: send status failed", err);
      }
    };

    send();
  }, [
    latestStatus,
    userId,
    account,
    meta,
    watchPartyEnabled,
    roomCode,
    isHost,
    backendUrl,
  ]);

  return null;
}
