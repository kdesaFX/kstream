import classNames from "classnames";
import { PointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { useEffectOnce, useTimeoutFn } from "react-use";

import { Seek, SeekDirection } from "@/components/player/atoms/Seek";
import { useShouldShowVideoElement } from "@/components/player/internals/VideoContainer";
import { useOverlayStack } from "@/stores/interface/overlayStack";
import { PlayerHoverState } from "@/stores/player/slices/interface";
import { usePlayerStore } from "@/stores/player/store";
import { usePreferencesStore } from "@/stores/preferences";
import { useWatchPartyStore } from "@/stores/watchParty";

/**
 * Full-surface click target for play/pause, double-click seek, and hold-to-boost.
 *
 * Play/resume MUST run on pointerdown (user-activation). Pause runs on the
 * single-tap path after the double-tap window so seeks still work.
 */
export function VideoClickTarget(props: { showingControls: boolean }) {
  const show = useShouldShowVideoElement();
  const display = usePlayerStore((s) => s.display);
  const time = usePlayerStore((s) => s.progress.time);
  const playbackRate = usePlayerStore((s) => s.mediaPlaying.playbackRate);
  const updateInterfaceHovering = usePlayerStore(
    (s) => s.updateInterfaceHovering,
  );
  const setSpeedBoosted = usePlayerStore((s) => s.setSpeedBoosted);
  const setShowSpeedIndicator = usePlayerStore((s) => s.setShowSpeedIndicator);
  const hovering = usePlayerStore((s) => s.interface.hovering);
  const setCurrentOverlay = useOverlayStack((s) => s.setCurrentOverlay);
  const isInWatchParty = useWatchPartyStore((s) => s.enabled);
  const enableHoldToBoost = usePreferencesStore((s) => s.enableHoldToBoost);
  const enableDoubleClickToSeek = usePreferencesStore(
    (s) => s.enableDoubleClickToSeek,
  );

  const [_, cancel, reset] = useTimeoutFn(() => {
    updateInterfaceHovering(PlayerHoverState.NOT_HOVERING);
  }, 3000);
  useEffectOnce(() => {
    cancel();
  });

  const previousRateRef = useRef(playbackRate);
  const isHoldingRef = useRef(false);
  const speedIndicatorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const boostTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const resumedOnPointerDownRef = useRef(false);
  const [isPendingBoost, setIsPendingBoost] = useState(false);
  const [seekDirection, setSeekDirection] = useState<SeekDirection | null>(
    null,
  );
  const [seekId, setSeekId] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const seekTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const singleTapTimeout = useRef<NodeJS.Timeout | null>(null);

  const toggleFullscreen = useCallback(() => {
    display?.toggleFullscreen();
  }, [display]);

  const handleDoubleClick = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!enableDoubleClickToSeek) {
        toggleFullscreen();
        return;
      }
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const oneThird = rect.width / 3;

      if (x < oneThird) {
        display?.setTime(time - 10);
        setSeekDirection("backward");
        setSeekId((s) => s + 1);
        setIsSeeking(true);
      } else if (x > oneThird * 2) {
        display?.setTime(time + 10);
        setSeekDirection("forward");
        setSeekId((s) => s + 1);
        setIsSeeking(true);
      } else {
        toggleFullscreen();
      }
    },
    [display, toggleFullscreen, enableDoubleClickToSeek, time],
  );

  useEffect(() => {
    if (!isSeeking) return;
    if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
    seekTimeoutRef.current = setTimeout(() => {
      setIsSeeking(false);
    }, 400);
  }, [seekId, isSeeking]);

  const pauseIfPlaying = useCallback(() => {
    if (isHoldingRef.current) {
      isHoldingRef.current = false;
      return;
    }
    if (isPendingBoost) {
      clearTimeout(boostTimeoutRef.current!);
      setIsPendingBoost(false);
      isHoldingRef.current = false;
    }
    // Live state — don't trust a stale isPaused from the last render.
    if (!usePlayerStore.getState().mediaPlaying.isPaused) {
      display?.pause();
    }
  }, [display, isPendingBoost]);

  const handleSingleTap = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      // We already started/resumed on pointerdown — don't immediately pause.
      if (resumedOnPointerDownRef.current) {
        resumedOnPointerDownRef.current = false;
        return;
      }

      if (e.pointerType === "mouse") {
        if (e.button !== 0) return;
        pauseIfPlaying();
        return;
      }

      // Touch: first tap shows controls, second tap pauses (unless seeking).
      if (isSeeking) return;
      if (hovering !== PlayerHoverState.MOBILE_TAPPED) {
        updateInterfaceHovering(PlayerHoverState.MOBILE_TAPPED);
        reset();
        return;
      }
      pauseIfPlaying();
      updateInterfaceHovering(PlayerHoverState.NOT_HOVERING);
      cancel();
    },
    [
      pauseIfPlaying,
      isSeeking,
      hovering,
      updateInterfaceHovering,
      reset,
      cancel,
    ],
  );

  const handleTap = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;

      if (singleTapTimeout.current) {
        clearTimeout(singleTapTimeout.current);
        singleTapTimeout.current = null;
        resumedOnPointerDownRef.current = false;
        handleDoubleClick(e);
        return;
      }

      singleTapTimeout.current = setTimeout(() => {
        singleTapTimeout.current = null;
        handleSingleTap(e);
      }, 250);
    },
    [handleDoubleClick, handleSingleTap],
  );

  const handlePointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;

      const playing = usePlayerStore.getState().mediaPlaying;

      // Play/resume on the gesture tick — never behind the double-tap timer.
      if (!playing.hasPlayedOnce || playing.isPaused) {
        resumedOnPointerDownRef.current = true;
        display?.play();
        return;
      }

      resumedOnPointerDownRef.current = false;

      if (
        (e.pointerType === "mouse" || e.pointerType === "touch") &&
        !isInWatchParty &&
        enableHoldToBoost
      ) {
        previousRateRef.current = playbackRate;
        if (boostTimeoutRef.current) clearTimeout(boostTimeoutRef.current);
        setIsPendingBoost(true);
        boostTimeoutRef.current = setTimeout(() => {
          isHoldingRef.current = true;
          setIsPendingBoost(false);
          setSpeedBoosted(true);
          setShowSpeedIndicator(true);
          setCurrentOverlay("speed");
          if (speedIndicatorTimeoutRef.current) {
            clearTimeout(speedIndicatorTimeoutRef.current);
          }
          display?.setPlaybackRate(2);
        }, 300);
      }
    },
    [
      display,
      playbackRate,
      setSpeedBoosted,
      setShowSpeedIndicator,
      setCurrentOverlay,
      isInWatchParty,
      enableHoldToBoost,
    ],
  );

  const endBoost = useCallback(() => {
    display?.setPlaybackRate(previousRateRef.current);
    isHoldingRef.current = false;
    setSpeedBoosted(false);
    if (speedIndicatorTimeoutRef.current) {
      clearTimeout(speedIndicatorTimeoutRef.current);
    }
    speedIndicatorTimeoutRef.current = setTimeout(() => {
      setShowSpeedIndicator(false);
      setCurrentOverlay(null);
      speedIndicatorTimeoutRef.current = null;
    }, 1500);
  }, [display, setSpeedBoosted, setShowSpeedIndicator, setCurrentOverlay]);

  const handlePointerUp = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (isPendingBoost) {
        clearTimeout(boostTimeoutRef.current!);
        setIsPendingBoost(false);
        handleTap(e);
        return;
      }

      if (
        isHoldingRef.current &&
        enableHoldToBoost &&
        (e.pointerType === "mouse" || e.pointerType === "touch")
      ) {
        endBoost();
        return;
      }

      handleTap(e);
    },
    [isPendingBoost, enableHoldToBoost, handleTap, endBoost],
  );

  const handlePointerLeave = useCallback(() => {
    if (isPendingBoost) {
      clearTimeout(boostTimeoutRef.current!);
      setIsPendingBoost(false);
    }
    if (isHoldingRef.current) endBoost();
  }, [isPendingBoost, endBoost]);

  if (!show) return null;

  return (
    <>
      {seekDirection ? (
        <div
          key={seekId}
          onAnimationEnd={() => setSeekDirection(null)}
          className={
            seekDirection === "backward"
              ? "absolute inset-0 flex items-center justify-start ml-32"
              : "absolute inset-0 flex items-center justify-end mr-32"
          }
        >
          <Seek direction={seekDirection} />
        </div>
      ) : null}
      <div
        className={classNames("absolute inset-0", {
          "cursor-none": !props.showingControls,
        })}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onContextMenu={(e) => e.preventDefault()}
      />
    </>
  );
}
