/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import { isPlaybackVisiblyRunning } from "./spinnerState";

const playing = {
  paused: false,
  seeking: false,
  readyState: 4,
  advancedBy: 0.25,
};

describe("isPlaybackVisiblyRunning", () => {
  it("recognises playback that is moving", () => {
    expect(isPlaybackVisiblyRunning(playing)).toBe(true);
  });

  it("ignores a paused element", () => {
    expect(isPlaybackVisiblyRunning({ ...playing, paused: true })).toBe(false);
  });

  it("waits out a seek in progress", () => {
    expect(isPlaybackVisiblyRunning({ ...playing, seeking: true })).toBe(false);
  });

  it("does not trust time changes without enough buffered data", () => {
    expect(isPlaybackVisiblyRunning({ ...playing, readyState: 2 })).toBe(false);
  });

  it("treats a stuck or rewound position as not running", () => {
    expect(isPlaybackVisiblyRunning({ ...playing, advancedBy: 0 })).toBe(false);
    expect(isPlaybackVisiblyRunning({ ...playing, advancedBy: -8 })).toBe(false);
  });
});
