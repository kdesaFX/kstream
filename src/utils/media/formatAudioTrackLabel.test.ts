/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import {
  formatAudioTrackLabel,
  isUninformativeAudioTrack,
} from "@/utils/media/formatAudioTrackLabel";

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

  it("falls back instead of repeating names that name nothing", () => {
    for (const name of ["Audio 1", "audio_2", "Track 3", "A1", "default", "2"]) {
      expect(formatAudioTrackLabel("unknown", name, "Track 1")).toBe("Track 1");
    }
  });

  it("keeps names that do say something", () => {
    expect(formatAudioTrackLabel("unknown", "Original", "Track 1")).toBe(
      "Original",
    );
    expect(formatAudioTrackLabel("unknown", "Commentary", "Track 1")).toBe(
      "Commentary",
    );
  });

  it("prefers the language over a placeholder name", () => {
    expect(formatAudioTrackLabel("ja", "Audio 1", "Track 1")).toBe("Japanese");
  });
});

describe("isUninformativeAudioTrack", () => {
  it("flags tracks with neither a language nor a real name", () => {
    expect(isUninformativeAudioTrack("unknown", "Audio 1")).toBe(true);
    expect(isUninformativeAudioTrack(undefined, undefined)).toBe(true);
    expect(isUninformativeAudioTrack("und", "track_2")).toBe(true);
  });

  it("leaves anything a viewer could act on alone", () => {
    expect(isUninformativeAudioTrack("ja", "Audio 1")).toBe(false);
    expect(isUninformativeAudioTrack("unknown", "Original")).toBe(false);
    expect(isUninformativeAudioTrack("unknown", "5.1")).toBe(false);
  });
});
