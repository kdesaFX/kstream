/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import { shouldClimbQuality } from "@/components/player/display/qualityClimb";

const MBPS = 1000 * 1000;

describe("auto quality climb", () => {
  it("waits for a healthy buffer before climbing", () => {
    expect(
      shouldClimbQuality({
        bufferedAhead: 2,
        bandwidthEstimate: 20 * MBPS,
        targetBitrate: 3 * MBPS,
      }),
    ).toBe(false);
  });

  it("climbs when the connection has room for the higher rung", () => {
    expect(
      shouldClimbQuality({
        bufferedAhead: 6,
        bandwidthEstimate: 20 * MBPS,
        targetBitrate: 3 * MBPS,
      }),
    ).toBe(true);
  });

  it("stays put when the source cannot feed the higher rung", () => {
    // 1embed through the proxy measured ~0.4 Mbps against a 3 Mbps rung:
    // buffer looks fine for a few seconds, then playback strands.
    expect(
      shouldClimbQuality({
        bufferedAhead: 6,
        bandwidthEstimate: 0.4 * MBPS,
        targetBitrate: 3 * MBPS,
      }),
    ).toBe(false);
  });

  it("refuses to climb without real headroom over the target", () => {
    expect(
      shouldClimbQuality({
        bufferedAhead: 6,
        bandwidthEstimate: 3.2 * MBPS,
        targetBitrate: 3 * MBPS,
      }),
    ).toBe(false);
  });

  it("falls back to the buffer check when bitrate is unknown", () => {
    expect(
      shouldClimbQuality({
        bufferedAhead: 6,
        bandwidthEstimate: 0.4 * MBPS,
        targetBitrate: 0,
      }),
    ).toBe(true);
  });

  it("falls back to the buffer check before any bandwidth estimate exists", () => {
    expect(
      shouldClimbQuality({
        bufferedAhead: 6,
        bandwidthEstimate: 0,
        targetBitrate: 3 * MBPS,
      }),
    ).toBe(true);
  });
});
