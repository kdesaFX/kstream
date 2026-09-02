/* eslint-disable import/no-extraneous-dependencies */
import type { ScrapeMedia } from "@p-stream/providers";
import { describe, expect, it } from "vitest";

import {
  hasWatchProgressForTitle,
  shouldTryWay2SoloFirst,
  WAY2_SOLO_SOURCE_ID,
} from "./way2SoloFirst";

const ctx = {
  env: "desktop" as const,
  mediaType: "show" as const,
  meta: null,
};

describe("shouldTryWay2SoloFirst", () => {
  it("skips solo when resuming after a failed source", () => {
    expect(
      shouldTryWay2SoloFirst(["way2movies", "nova"], null, {
        startFromSourceId: "nova",
        sourceOrderCtx: ctx,
        isReturningViewer: false,
      }),
    ).toBe(false);
  });

  it("skips solo for returning viewers unless Way2 is pinned", () => {
    expect(
      shouldTryWay2SoloFirst(["way2movies", "nova"], null, {
        sourceOrderCtx: ctx,
        isReturningViewer: true,
      }),
    ).toBe(false);
    expect(
      shouldTryWay2SoloFirst(["way2movies", "nova"], WAY2_SOLO_SOURCE_ID, {
        sourceOrderCtx: ctx,
        isReturningViewer: true,
      }),
    ).toBe(true);
  });

  it("allows solo near the front on a cold play", () => {
    expect(
      shouldTryWay2SoloFirst(["way2movies", "nova"], null, {
        sourceOrderCtx: ctx,
        isReturningViewer: false,
      }),
    ).toBe(true);
  });
});

describe("hasWatchProgressForTitle", () => {
  const media = { tmdbId: "1", type: "show" } as ScrapeMedia;

  it("detects episode progress", () => {
    expect(
      hasWatchProgressForTitle(
        {
          "1": {
            title: "The Mentalist",
            type: "show",
            updatedAt: 0,
            seasons: {},
            episodes: {
              ep1: {
                title: "Ep 10",
                number: 10,
                id: "ep1",
                seasonId: "s3",
                updatedAt: 0,
                progress: { watched: 600, duration: 2400 },
              },
            },
          },
        },
        media,
        {
          tmdbId: "1",
          type: "show",
          episode: { tmdbId: "ep1", number: 10 },
        } as any,
      ),
    ).toBe(true);
  });
});
