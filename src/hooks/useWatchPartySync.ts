/* eslint-disable no-console */
import { useCallback, useEffect, useRef, useState } from "react";

import { getRoomStatuses } from "@/backend/player/status";
import { useBackendUrl } from "@/hooks/auth/useBackendUrl";
import { useAuthStore } from "@/stores/auth";
import { usePlayerStore } from "@/stores/player/store";
import { useWatchPartyStore } from "@/stores/watchParty";

export interface RoomUser {
  userId: string;
  isHost: boolean;
  lastUpdate: number;
  player: {
    isPlaying: boolean;
    isPaused: boolean;
    time: number;
    duration: number;
  };
  content: {
    title: string;
    type: string;
    tmdbId?: number;
    seasonId?: number;
    episodeId?: number;
    seasonNumber?: number;
    episodeNumber?: number;
  };
}

export interface WatchPartySyncResult {
  roomUsers: RoomUser[];
  hostUser: RoomUser | null;
  isBehindHost: boolean;
  isAheadOfHost: boolean;
  timeDifferenceFromHost: number;
  syncWithHost: () => void;
  isSyncing: boolean;
  refreshRoomData: () => Promise<void>;
  userCount: number;
  isOffline: boolean;
}

const POLL_INTERVAL_MS = 2000;
const BACKOFF_MAX_MS = 15000;
const STALE_USER_MS = 12000;

export function useWatchPartySync(
  syncThresholdSeconds = 5,
): WatchPartySyncResult {
  const [roomUsers, setRoomUsers] = useState<RoomUser[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [userCount, setUserCount] = useState(1);
  const [isOffline, setIsOffline] = useState(false);

  const stateRef = useRef({
    previousHostPlaying: null as boolean | null,
    previousHostTime: null as number | null,
    syncInProgress: false,
    checkedUrlParams: false,
    consecutiveErrors: 0,
  });

  const account = useAuthStore((s) => s.account);
  const backendUrl = useBackendUrl();

  const display = usePlayerStore((s) => s.display);
  const currentTime = usePlayerStore((s) => s.progress.time);
  const isPlaying = usePlayerStore((s) => s.mediaPlaying.isPlaying);

  const { roomCode, isHost, enabled, enableAsGuest } = useWatchPartyStore();

  useEffect(() => {
    if (!enabled) stateRef.current.checkedUrlParams = false;
  }, [enabled]);

  useEffect(() => {
    if (stateRef.current.checkedUrlParams) return;
    try {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("watchparty");
      if (code && !enabled && code.length > 0) enableAsGuest(code);
      stateRef.current.checkedUrlParams = true;
    } catch (err) {
      console.error("watchparty: url param parse", err);
    }
  }, [enabled, enableAsGuest]);

  const hostUser = roomUsers.find((u) => u.isHost) ?? null;

  const getPredictedHostTime = useCallback(() => {
    if (!hostUser) return 0;
    const elapsedSeconds = (Date.now() - hostUser.lastUpdate) / 1000;
    return hostUser.player.isPlaying && !hostUser.player.isPaused
      ? hostUser.player.time + elapsedSeconds
      : hostUser.player.time;
  }, [hostUser]);

  const timeDifferenceFromHost = hostUser
    ? currentTime - getPredictedHostTime()
    : 0;

  const isBehindHost =
    !!hostUser && !isHost && timeDifferenceFromHost < -syncThresholdSeconds;
  const isAheadOfHost =
    !!hostUser && !isHost && timeDifferenceFromHost > syncThresholdSeconds;

  const syncWithHost = useCallback(() => {
    if (!hostUser || isHost || !display || stateRef.current.syncInProgress)
      return;
    stateRef.current.syncInProgress = true;
    setIsSyncing(true);

    const target = getPredictedHostTime();
    display.setTime(target);

    setTimeout(() => {
      if (hostUser.player.isPlaying && !hostUser.player.isPaused) {
        display.play();
      } else {
        display.pause();
      }
      setTimeout(() => {
        setIsSyncing(false);
        stateRef.current.syncInProgress = false;
      }, 400);
    }, 200);
  }, [hostUser, isHost, display, getPredictedHostTime]);

  useEffect(() => {
    if (!hostUser || isHost || !display || stateRef.current.syncInProgress)
      return;

    const state = stateRef.current;
    const hostIsPlaying =
      hostUser.player.isPlaying && !hostUser.player.isPaused;
    const predicted = getPredictedHostTime();
    const diff = currentTime - predicted;

    const driftThreshold = isPlaying ? 3 : 5;
    const needsTimeSync = Math.abs(diff) > driftThreshold;
    const needsPlayStateSync =
      state.previousHostPlaying !== null &&
      state.previousHostPlaying !== hostIsPlaying;
    const needsJumpSync =
      state.previousHostTime !== null &&
      Math.abs(hostUser.player.time - state.previousHostTime) > 5;

    if ((needsTimeSync || needsPlayStateSync || needsJumpSync) && !isSyncing) {
      state.syncInProgress = true;
      setIsSyncing(true);

      display.setTime(predicted);
      setTimeout(() => {
        if (hostIsPlaying) display.play();
        else display.pause();
        setTimeout(() => {
          setIsSyncing(false);
          state.syncInProgress = false;
        }, 400);
      }, 200);
    }

    state.previousHostPlaying = hostIsPlaying;
    state.previousHostTime = hostUser.player.time;
  }, [
    hostUser,
    isHost,
    currentTime,
    display,
    isSyncing,
    getPredictedHostTime,
    isPlaying,
  ]);

  const refreshRoomData = useCallback(async () => {
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

      setRoomUsers(users);
      setUserCount(Math.max(1, users.length));
      setIsOffline(false);
      stateRef.current.consecutiveErrors = 0;
    } catch (err) {
      stateRef.current.consecutiveErrors += 1;
      if (stateRef.current.consecutiveErrors >= 3) setIsOffline(true);
      console.error("watchparty: refresh failed", err);
    }
  }, [backendUrl, account, roomCode, enabled]);

  useEffect(() => {
    const state = stateRef.current;
    if (!enabled || !roomCode) {
      setRoomUsers([]);
      setUserCount(1);
      setIsOffline(false);
      state.previousHostPlaying = null;
      state.previousHostTime = null;
      state.consecutiveErrors = 0;
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      await refreshRoomData();
      if (cancelled) return;
      const backoff =
        state.consecutiveErrors > 0
          ? Math.min(
              POLL_INTERVAL_MS * 2 ** state.consecutiveErrors,
              BACKOFF_MAX_MS,
            )
          : POLL_INTERVAL_MS;
      timeoutId = setTimeout(tick, backoff);
    };

    tick();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      state.previousHostPlaying = null;
      state.previousHostTime = null;
    };
  }, [enabled, roomCode, refreshRoomData]);

  return {
    roomUsers,
    hostUser,
    isBehindHost,
    isAheadOfHost,
    timeDifferenceFromHost,
    syncWithHost,
    isSyncing,
    refreshRoomData,
    userCount,
    isOffline,
  };
}
