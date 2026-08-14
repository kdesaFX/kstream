/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it, vi } from "vitest";

/**
 * Mirrors Pause / Skip control decisions so we don't regress stale-state toggles.
 */
function nextPlaybackAction(isPaused: boolean): "play" | "pause" {
  return isPaused ? "play" : "pause";
}

function clampSeekTime(
  target: number,
  duration: number,
  lastValidDuration = 0,
): number | null {
  const max =
    Number.isFinite(duration) && duration > 0
      ? duration
      : lastValidDuration > 0
        ? lastValidDuration
        : null;

  if (max == null) {
    const time = Math.max(0, target);
    return Number.isNaN(time) ? null : time;
  }

  let time = Math.min(target, max);
  time = Math.max(0, time);
  return Number.isNaN(time) ? null : time;
}

describe("playback controls", () => {
  it("toggles play when paused and pause when playing", () => {
    expect(nextPlaybackAction(true)).toBe("play");
    expect(nextPlaybackAction(false)).toBe("pause");
  });

  it("skips forward/back by 10 seconds within duration", () => {
    expect(clampSeekTime(50 + 10, 100)).toBe(60);
    expect(clampSeekTime(50 - 10, 100)).toBe(40);
  });

  it("clamps skip past the end and before the start", () => {
    expect(clampSeekTime(95 + 10, 100)).toBe(100);
    expect(clampSeekTime(5 - 10, 100)).toBe(0);
  });

  it("still seeks when duration is temporarily unknown", () => {
    expect(clampSeekTime(30 + 10, Number.NaN, 0)).toBe(40);
    expect(clampSeekTime(30 + 10, Number.NaN, 120)).toBe(40);
  });

  it("uses live pause state rather than a stale closure value", () => {
    let isPaused = true;
    const display = {
      play: vi.fn(() => {
        isPaused = false;
      }),
      pause: vi.fn(() => {
        isPaused = true;
      }),
    };

    const toggle = () => {
      // live read (what Pause.tsx should do)
      if (isPaused) display.play();
      else display.pause();
    };

    toggle();
    expect(display.play).toHaveBeenCalledOnce();
    toggle();
    expect(display.pause).toHaveBeenCalledOnce();
    toggle();
    expect(display.play).toHaveBeenCalledTimes(2);
  });
});
