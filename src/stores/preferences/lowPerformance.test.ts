/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import {
  applyLowPerformanceRestrictions,
  captureLowPerformanceSnapshot,
  restoreLowPerformanceSnapshot,
  type LowPerformanceSnapshot,
} from "@/stores/preferences/lowPerformance";

function sample(overrides: Partial<LowPerformanceSnapshot> = {}): LowPerformanceSnapshot {
  return {
    enableThumbnails: true,
    enableAutoplay: true,
    enableDiscover: true,
    enableFeatured: false,
    enableDetailsModal: true,
    enableImageLogos: true,
    enablePauseOverlay: false,
    forceCompactEpisodeView: false,
    ...overrides,
  };
}

describe("low performance snapshot", () => {
  it("restores the settings performance mode turned off", () => {
    const before = sample();
    const snap = captureLowPerformanceSnapshot(before);
    applyLowPerformanceRestrictions(before);
    expect(before.enableDiscover).toBe(false);
    expect(before.forceCompactEpisodeView).toBe(true);

    restoreLowPerformanceSnapshot(before, snap);
    expect(before).toEqual(snap);
  });
});
