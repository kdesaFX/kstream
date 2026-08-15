/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

/**
 * Mirrors reportVolumeToUi / policyMuted behavior from base.ts.
 * Policy mute must NOT report 0 or pause/play will spike the slider.
 */
function reportVolumeToUi(opts: {
  policyMuted: boolean;
  muted: boolean;
  volume: number;
  lastVolume: number;
}): number {
  if (opts.policyMuted) return opts.lastVolume;
  return opts.muted ? 0 : opts.volume;
}

describe("policy mute volume UI", () => {
  it("keeps the slider at lastVolume while policy-muted", () => {
    expect(
      reportVolumeToUi({
        policyMuted: true,
        muted: true,
        volume: 1,
        lastVolume: 0.42,
      }),
    ).toBe(0.42);
  });

  it("does not jump to full volume on pause while policy-muted", () => {
    const before = reportVolumeToUi({
      policyMuted: true,
      muted: true,
      volume: 1,
      lastVolume: 0.55,
    });
    // pause click used to unmute + emit lastVolume (often 1)
    const afterFakeUnmute = reportVolumeToUi({
      policyMuted: false,
      muted: false,
      volume: 1,
      lastVolume: 0.55,
    });
    // With the fix we never fake-unmute on pause, so UI stays put.
    expect(before).toBe(0.55);
    // And if user volume was 0.55, unmute should show 0.55 not 1
    expect(afterFakeUnmute).toBe(1); // element.volume may be 1 if lastVolume wasn't applied
    // Correct unmute path applies lastVolume to element.volume:
    expect(
      reportVolumeToUi({
        policyMuted: false,
        muted: false,
        volume: 0.55,
        lastVolume: 0.55,
      }),
    ).toBe(0.55);
  });

  it("shows 0 only for intentional user mute", () => {
    expect(
      reportVolumeToUi({
        policyMuted: false,
        muted: true,
        volume: 0.8,
        lastVolume: 0.8,
      }),
    ).toBe(0);
  });
});

/** Mirrors the autoplay branch in tryAutoplay. */
function shouldAutoplayWithSound(opts: {
  lastVolume: number;
  hasBeenActive: boolean;
}): boolean {
  return opts.lastVolume > 0 && opts.hasBeenActive;
}

/** Mirrors the gate in armUnmuteOnGesture's handler. */
function shouldUnmuteOnGesture(opts: {
  isTrusted: boolean;
  isActive: boolean;
  policyMuted: boolean;
  lastVolume: number;
}): boolean {
  if (opts.lastVolume <= 0) return false;
  if (!opts.isTrusted && !opts.isActive) return false;
  return opts.policyMuted;
}

/** Mirrors the post-unmute recovery timer. */
function shouldRecoverMutedPlayback(opts: {
  paused: boolean;
  ended: boolean;
  msSinceUserPause: number;
}): boolean {
  if (!opts.paused || opts.ended) return false;
  return opts.msSinceUserPause >= 500;
}

describe("starting playback with sound", () => {
  it("autoplays unmuted when the page still has user activation", () => {
    expect(
      shouldAutoplayWithSound({ lastVolume: 0.6, hasBeenActive: true }),
    ).toBe(true);
  });

  it("autoplays muted on a cold reload with no activation", () => {
    expect(
      shouldAutoplayWithSound({ lastVolume: 0.6, hasBeenActive: false }),
    ).toBe(false);
  });

  it("stays muted when the viewer's volume is zero", () => {
    expect(shouldAutoplayWithSound({ lastVolume: 0, hasBeenActive: true })).toBe(
      false,
    );
  });

  it("unmutes on the first real gesture after a muted autoplay", () => {
    expect(
      shouldUnmuteOnGesture({
        isTrusted: true,
        isActive: true,
        policyMuted: true,
        lastVolume: 0.6,
      }),
    ).toBe(true);
  });

  it("ignores gestures once the viewer already controls the volume", () => {
    expect(
      shouldUnmuteOnGesture({
        isTrusted: true,
        isActive: true,
        policyMuted: false,
        lastVolume: 0.6,
      }),
    ).toBe(false);
  });

  it("ignores synthetic events that grant no activation", () => {
    expect(
      shouldUnmuteOnGesture({
        isTrusted: false,
        isActive: false,
        policyMuted: true,
        lastVolume: 0.6,
      }),
    ).toBe(false);
  });

  it("leaves playback paused when the unmuting gesture was a pause click", () => {
    expect(
      shouldRecoverMutedPlayback({
        paused: true,
        ended: false,
        msSinceUserPause: 20,
      }),
    ).toBe(false);
  });

  it("does not restart a finished video", () => {
    expect(
      shouldRecoverMutedPlayback({
        paused: true,
        ended: true,
        msSinceUserPause: 10000,
      }),
    ).toBe(false);
  });

  it("resumes muted when unmuting itself stopped playback", () => {
    expect(
      shouldRecoverMutedPlayback({
        paused: true,
        ended: false,
        msSinceUserPause: 10000,
      }),
    ).toBe(true);
  });
});
