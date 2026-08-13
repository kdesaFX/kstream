/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import { formatAudioTrackLabel } from "@/utils/media/formatAudioTrackLabel";

describe("formatAudioTrackLabel", () => {
  it("turns channel-only HLS tracks into Surround (5.1)", () => {
    expect(formatAudioTrackLabel("unknown", "5.1", "Unknown")).toBe(
      "Surround (5.1)",
    );
    expect(formatAudioTrackLabel("unknown", "Unknown (5.1)", "Unknown")).toBe(
      "Surround (5.1)",
    );
    expect(formatAudioTrackLabel(undefined, "atmos", "Unknown")).toBe(
      "Surround (atmos)",
    );
  });

  it("keeps real language names and appends channel info", () => {
    expect(formatAudioTrackLabel("en", "English 5.1", "Unknown")).toMatch(
      /English.*5\.1/,
    );
  });
});
