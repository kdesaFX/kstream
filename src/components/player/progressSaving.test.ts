import { describe, expect, it } from "vitest";

import { resumePoint } from "@/components/player/hooks/usePlayer";
import { shouldSaveProgress } from "@/components/player/internals/ProgressSaver";

// A ~24 minute episode, the case that regressed: everything past the
// "treat credits bails as complete" mark stopped saving, so reloading late
// in an episode threw the viewer back to roughly the 19 minute mark.
const EPISODE = 24 * 60 + 10;

describe("resume position saving", () => {
  it("keeps saving through the last five minutes of an episode", () => {
    expect(
      shouldSaveProgress({ duration: EPISODE, watched: 23 * 60 + 50 }),
    ).toBe(true);
  });

  it("keeps saving past the 80% completed mark", () => {
    expect(
      shouldSaveProgress({ duration: EPISODE, watched: EPISODE * 0.85 }),
    ).toBe(true);
  });

  it("ignores the first few seconds so brief opens don't stick", () => {
    expect(shouldSaveProgress({ duration: EPISODE, watched: 3 })).toBe(false);
  });

  it("ignores progress with no known duration", () => {
    expect(shouldSaveProgress({ duration: 0, watched: 600 })).toBe(false);
  });
});

describe("resume point", () => {
  it("resumes where the viewer actually left off late in an episode", () => {
    expect(resumePoint({ duration: EPISODE, watched: 23 * 60 + 50 })).toBe(
      23 * 60 + 50,
    );
  });

  it("starts over instead of parking on the final frame", () => {
    expect(resumePoint({ duration: EPISODE, watched: EPISODE - 2 })).toBe(0);
    expect(resumePoint({ duration: EPISODE, watched: EPISODE })).toBe(0);
  });

  it("starts from the beginning with nothing saved", () => {
    expect(resumePoint(undefined)).toBe(0);
    expect(resumePoint({ duration: 0, watched: 0 })).toBe(0);
  });
});
