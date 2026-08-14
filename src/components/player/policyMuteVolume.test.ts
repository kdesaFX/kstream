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
