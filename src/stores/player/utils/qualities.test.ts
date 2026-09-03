/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import {
  getPreferredQuality,
  highestAvailableQuality,
  selectQuality,
} from "@/stores/player/utils/qualities";

describe("getPreferredQuality", () => {
  it("falls back to a level the newly selected source actually has", () => {
    expect(
      getPreferredQuality(["360", "720", "1080"], {
        automaticQuality: false,
        lastChosenQuality: "480",
      }),
    ).toBe("360");
  });

  it("keeps the selected level when the new source also has it", () => {
    expect(
      getPreferredQuality(["360", "480", "720"], {
        automaticQuality: false,
        lastChosenQuality: "480",
      }),
    ).toBe("480");
  });
});

describe("selectQuality", () => {
  it("starts file sources at 480p in Auto mode", () => {
    expect(
      selectQuality(
        {
          type: "file",
          qualities: {
            "480": { type: "mp4", url: "https://example.com/480.mp4" },
            "1080": { type: "mp4", url: "https://example.com/1080.mp4" },
          },
        },
        {
          automaticQuality: true,
          lastChosenQuality: null,
        },
      ),
    ).toEqual({
      quality: "480",
      stream: { type: "mp4", url: "https://example.com/480.mp4" },
    });
  });
});

describe("highestAvailableQuality", () => {
  it("returns the best tier present", () => {
    expect(highestAvailableQuality(["360", "720", "480"])).toBe("720");
  });

  it("ignores unknown", () => {
    expect(highestAvailableQuality(["unknown", "480"])).toBe("480");
  });
});
