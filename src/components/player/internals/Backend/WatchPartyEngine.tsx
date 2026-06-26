/* eslint-disable no-console */
import { useCallback, useEffect, useRef } from "react";

import { getRoomStatuses } from "@/backend/player/status";
import { useBackendUrl } from "@/hooks/auth/useBackendUrl";
import { useAuthStore } from "@/stores/auth";
import { usePlayerStore } from "@/stores/player/store";
import { useWatchPartyStore } from "@/stores/watchParty";
import {
  RoomUser,
  useWatchPartySyncStore,
} from "@/stores/watchParty/sync";

const POLL_INTERVAL_MS = 2000;
const BACKOFF_MAX_MS = 15000;
const STALE_USER_MS = 12000;
const DRIFT_THRESHOLD_SECONDS = 3;
const SYNC_SETTLE_MS = 800;

export function WatchPartyEngine() {
  const account = useAuthStore((s) => s.account);
  const backendUrl = useBackendUrl();

  const { roomCode, isHost, enabled, enableAsGuest } = useWatchPartyStore();

  const display = usePlayerStore((s) => s.display);
  const hostUser = useWatchPartySyncStore(
    (s) => s.roomUsers.find((u) => u.isHost) ?? null,
  );

  const engineRef = useRef({
    consecutiveErrors: 0,
    syncInProgress: false,
    hasInitialSynced: false,
    lastHostPlaying: null as boolean | null,
    lastSyncAt: 0,
    checkedUrlParams: false,
  });

  useEffect(() => {
    if (!enabled) engineRef.current.checkedUrlParams = false;
  }, [enabled]);

  useEffect(() => {
    if (engineRef.current.checkedUrlParams) return;
    try {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("watchparty");
      if (code && !enabled && code.length > 0) enableAsGuest(code);
      engineRef.current.checkedUrlParams = true;
    } catch (err) {
      console.error("watchparty: url param parse", err);
    }
  }, [enabled, enableAsGuest]);

  const refresh = useCallback(async () => {
    if (!enabled || !roomCode || !backendUrl) return;
    try {
      const response = await getRoomStatuses(backendUrl, account, roomCode);
      const now = Date.now();
      const users: RoomUser[] = [];

      Object.entries(response.users).forEach(([userId, statuses]) => {
        if (statuses.length === 0) return;
        const latest = [...statuses].sort((a, b) => b.timestamp - a.timestamp)[0];
        if (now - latest.timestamp > STALE_USER_MS) return;
        users.push({
          userId,
          isHost: latest.isHost,
          lastUpdate: latest.timestamp,
          player: { ...latest.player },
          content: { ...latest.content },
        });
      });

      users.sort((a, b) => {
        if (a.isHost && !b.isHost) return -1;
        if (!a.isHost && b.isHost) return 1;
        return b.lastUpdate - a.lastUpdate;
      });

      useWatchPartySyncStore.getState().setRoomState(users);
      useWatchPartySyncStore.getState().setOffline(false);
      engineRef.current.consecutiveErrors = 0;
    } catch (err) {
      engineRef.current.consecutiveErrors += 1;
      if (engineRef.current.consecutiveErrors >= 3) {
        useWatchPartySyncStore.getState().setOffline(true);
      }
      console.error("watchparty: refresh failed", err);
    }
  }, [backendUrl, account, roomCode, enabled]);

  useEffect(() => {
    if (!enabled || !roomCode) {
      useWatchPartySyncStore.getState().reset();
      const e = engineRef.current;
      e.hasInitialSynced = false;
      e.lastHostPlaying = null;
      e.consecutiveErrors = 0;
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      await refresh();
      if (cancelled) return;
      const errors = engineRef.current.consecutiveErrors;
      const interval =
        errors > 0
          ? Math.min(POLL_INTERVAL_MS * 2 ** errors, BACKOFF_MAX_MS)
          : POLL_INTERVAL_MS;
      timeoutId = setTimeout(tick, interval);
    };

    tick();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [enabled, roomCode, refresh]);

  useEffect(() => {
    const e = engineRef.current;

    if (!hostUser || isHost || !display) {
      e.hasInitialSynced = false;
      e.lastHostPlaying = null;
      return;
    }

    if (e.syncInProgress) return;
    if (Date.now() - e.lastSyncAt < SYNC_SETTLE_MS) return;

    const hostIsPlaying =
      hostUser.player.isPlaying && !hostUser.player.isPaused;
    const elapsed = (Date.now() - hostUser.lastUpdate) / 1000;
    const predicted = hostIsPlaying
      ? hostUser.player.time + elapsed
      : hostUser.player.time;
    const currentMyTime = usePlayerStore.getState().progress.time;
    const drift = currentMyTime - predicted;

    const needsInitial = !e.hasInitialSynced;
    const needsDrift =
      e.hasInitialSynced && Math.abs(drift) > DRIFT_THRESHOLD_SECONDS;
    const needsPlayState =
      e.lastHostPlaying !== null && e.lastHostPlaying !== hostIsPlaying;

    if (needsInitial || needsDrift || needsPlayState) {
      e.syncInProgress = true;
      e.lastSyncAt = Date.now();
      useWatchPartySyncStore.getState().setSyncing(true);

      try {
        display.setTime(predicted);
      } catch (err) {
        console.error("watchparty: setTime failed", err);
      }

      setTimeout(() => {
        try {
          if (hostIsPlaying) display.play();
          else display.pause();
        } catch (err) {
          console.error("watchparty: play/pause failed", err);
        }
        setTimeout(() => {
          useWatchPartySyncStore.getState().setSyncing(false);
          e.syncInProgress = false;
          e.hasInitialSynced = true;
        }, 350);
      }, 220);
    }

    e.lastHostPlaying = hostIsPlaying;
  }, [hostUser, isHost, display]);

  return null;
}
