import { useCallback, useEffect, useRef } from "react";

import { usePlayerStore } from "@/stores/player/store";
import { playerStatus } from "@/stores/player/slices/source";

import { usePlayerMeta } from "../hooks/usePlayerMeta";

function pushDesktopDiscordPresence(body: Record<string, unknown>) {
  const ipc = window.__KSTREAM_DESKTOP_IPC__;
  if (!ipc?.invoke) return Promise.resolve(false);
  return ipc
    .invoke("updateMediaMetadata", body)
    .then((res: { success?: boolean } | undefined) => {
      // Treat missing success as ok — older handlers / relays may omit it
      if (res == null) return true;
      if (typeof res.success === "boolean") return res.success;
      return true;
    })
    .catch(() => false);
}

export function MediaSession() {
  const { setDirectMeta } = usePlayerMeta();
  const setShouldStartFromBeginning = usePlayerStore(
    (s) => s.setShouldStartFromBeginning,
  );

  const mediaPlaying = usePlayerStore((s) => s.mediaPlaying);
  const progress = usePlayerStore((s) => s.progress);
  const meta = usePlayerStore((s) => s.meta);
  const display = usePlayerStore((s) => s.display);
  const status = usePlayerStore((s) => s.status);

  const shouldUpdatePositionState = useRef(false);
  const lastPlaybackPosition = useRef(0);
  const lastDiscordKey = useRef("");
  const lastMetadata = useRef<{
    title?: string;
    artist?: string;
    poster?: string;
  }>({});

  const changeEpisode = useCallback(
    (change: number) => {
      const nextEp = meta?.episodes?.find(
        (v) => v.number === (meta?.episode?.number ?? 0) + change,
      );

      if (!meta || !nextEp) return;
      const metaCopy = { ...meta };
      metaCopy.episode = nextEp;
      setShouldStartFromBeginning(true);
      setDirectMeta(metaCopy);
    },
    [meta, setDirectMeta, setShouldStartFromBeginning],
  );

  const updatePositionState = useCallback(
    (position: number) => {
      if (typeof navigator.mediaSession.setPositionState !== "function") return;

      const { duration, buffered } = progress;
      const { playbackRate } = mediaPlaying;

      if (
        typeof duration !== "number" ||
        Number.isNaN(duration) ||
        !Number.isFinite(duration) ||
        duration <= 0
      ) {
        return;
      }

      if (
        typeof position !== "number" ||
        Number.isNaN(position) ||
        position < 0
      ) {
        position = 0;
      }

      if (position > buffered) {
        shouldUpdatePositionState.current = true;
      }

      if (position > duration) {
        position = duration;
      }

      lastPlaybackPosition.current = progress.time;

      navigator.mediaSession.setPositionState({
        duration,
        playbackRate,
        position,
      });
    },
    [mediaPlaying, progress],
  );

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = mediaPlaying.isPaused
      ? "paused"
      : "playing";
  }, [mediaPlaying.isPaused]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    if (
      typeof progress.duration !== "number" ||
      Number.isNaN(progress.duration) ||
      progress.duration <= 0
    ) {
      return;
    }
    updatePositionState(progress.time);
  }, [
    progress.time,
    mediaPlaying.playbackRate,
    progress.duration,
    updatePositionState,
  ]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    const { time, duration } = progress;
    const { isLoading } = mediaPlaying;

    if (
      typeof duration !== "number" ||
      Number.isNaN(duration) ||
      duration <= 0
    ) {
      return;
    }

    if (!shouldUpdatePositionState.current && isLoading) {
      shouldUpdatePositionState.current = true;
    }

    if (
      !isLoading &&
      !shouldUpdatePositionState.current &&
      Math.abs(time - lastPlaybackPosition.current) >= 5
    ) {
      shouldUpdatePositionState.current = true;
    }

    if (shouldUpdatePositionState.current && !isLoading) {
      shouldUpdatePositionState.current = false;
      updatePositionState(time);
    }

    lastPlaybackPosition.current = time;
  }, [mediaPlaying, progress, updatePositionState]);

  useEffect(() => {
    if (
      !("mediaSession" in navigator) ||
      (!mediaPlaying.isLoading && mediaPlaying.isPlaying && !display)
    ) {
      return;
    }

    let title: string | undefined;
    let artist: string | undefined;

    if (meta?.type === "movie") {
      title = meta.title;
    } else if (meta?.type === "show") {
      artist = meta.title;
      title = `S${meta.season?.number} E${meta.episode?.number}: ${meta.episode?.title}`;
    }


    const poster = meta?.poster ?? "";
    if (
      lastMetadata.current.title !== title ||
      lastMetadata.current.artist !== artist ||
      lastMetadata.current.poster !== poster
    ) {
      lastMetadata.current = { title, artist, poster };
      navigator.mediaSession.metadata = new MediaMetadata({
        title,
        artist,
        artwork: [{ src: poster, sizes: "342x513", type: "image/png" }],
      });
    }

    navigator.mediaSession.setActionHandler("play", () => {
      if (mediaPlaying.isLoading) return;
      display?.play();
      updatePositionState(progress.time);
    });

    navigator.mediaSession.setActionHandler("pause", () => {
      if (mediaPlaying.isLoading) return;
      display?.pause();
      updatePositionState(progress.time);
    });

    navigator.mediaSession.setActionHandler("seekto", (e) => {
      if (e.seekTime == null) return;
      display?.setTime(e.seekTime);
      updatePositionState(e.seekTime);
    });

    if ((meta?.episode?.number ?? 1) > 1) {
      navigator.mediaSession.setActionHandler("previoustrack", () =>
        changeEpisode(-1),
      );
    } else {
      navigator.mediaSession.setActionHandler("previoustrack", null);
    }

    const totalEpisodes = meta?.episodes?.length ?? 0;
    const currentEpisodeNumber = meta?.episode?.number ?? 0;
    if (currentEpisodeNumber > 0 && currentEpisodeNumber < totalEpisodes) {
      navigator.mediaSession.setActionHandler("nexttrack", () =>
        changeEpisode(1),
      );
    } else {
      navigator.mediaSession.setActionHandler("nexttrack", null);
    }
  }, [
    changeEpisode,
    updatePositionState,
    mediaPlaying.isLoading,
    mediaPlaying.isPlaying,
    display,
    progress.duration,
    progress.time,
    meta?.episode?.number,
    meta?.episodes?.length,
    meta?.episode?.title,
    meta?.title,
    meta?.type,
    meta?.poster,
    meta?.season?.number,
  ]);

  // Discord Rich Presence (desktop app only)
  useEffect(() => {
    if (!window.__KSTREAM_DESKTOP_IPC__?.invoke) return;

    if (status !== playerStatus.PLAYING || !meta?.title) {
      if (lastDiscordKey.current !== "idle") {
        lastDiscordKey.current = "idle";
        void pushDesktopDiscordPresence({ idle: true });
      }
      return;
    }

    let sendId = 0;
    let appliedId = 0;

    const send = () => {
      const state = usePlayerStore.getState();
      const currentMeta = state.meta;
      if (!currentMeta?.title || state.status !== playerStatus.PLAYING) return;

      // Default store is isPaused=true before the first play event — don't
      // advertise "Paused" while the stream is still starting.
      if (!state.mediaPlaying.hasPlayedOnce) return;

      const isPaused =
        state.mediaPlaying.isPaused || !state.mediaPlaying.isPlaying;

      const payload = {
        title: currentMeta.title,
        releaseYear: currentMeta.releaseYear || undefined,
        releaseDate: currentMeta.releaseDate || undefined,
        episodeTitle:
          currentMeta.type === "show" ? currentMeta.episode?.title : undefined,
        seasonNumber:
          currentMeta.type === "show" ? currentMeta.season?.number : undefined,
        episodeNumber:
          currentMeta.type === "show" ? currentMeta.episode?.number : undefined,
        poster: currentMeta.poster || undefined,
        isPaused,
        url: typeof window !== "undefined" ? window.location.href : undefined,
      };

      const key = [
        payload.title,
        payload.releaseDate,
        payload.releaseYear,
        payload.seasonNumber,
        payload.episodeNumber,
        payload.episodeTitle,
        payload.isPaused,
      ].join("|");

      if (key === lastDiscordKey.current) return;

      const id = ++sendId;
      void pushDesktopDiscordPresence(payload).then((ok) => {
        // Ignore stale IPC responses so an early "Paused" can't overwrite Watching
        if (!ok || id < appliedId) return;
        appliedId = id;
        lastDiscordKey.current = key;
      });
    };

    send();
    const interval = window.setInterval(send, 5000);
    return () => window.clearInterval(interval);
  }, [
    status,
    meta?.title,
    meta?.type,
    meta?.poster,
    meta?.releaseYear,
    meta?.releaseDate,
    meta?.season?.number,
    meta?.episode?.number,
    meta?.episode?.title,
    mediaPlaying.isPaused,
    mediaPlaying.isPlaying,
    mediaPlaying.hasPlayedOnce,
  ]);

  useEffect(() => {
    return () => {
      if (lastDiscordKey.current !== "" && lastDiscordKey.current !== "idle") {
        lastDiscordKey.current = "idle";
        void pushDesktopDiscordPresence({ idle: true });
      }
    };
  }, []);

  return null;
}

// what did we learn today? never use isNaN instead of Number.isNaN !!!
