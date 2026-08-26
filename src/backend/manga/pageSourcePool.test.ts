/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import {
  PAGE_SOURCE_POOL_SIZE,
  racePageSourcesPool,
} from "@/backend/manga/pageSourcePool";

describe("racePageSourcesPool", () => {
  it("returns the first successful result", async () => {
    const pages = await racePageSourcesPool([
      async () => null,
      async () => ["a"],
      async () => ["b"],
    ]);
    expect(pages).toEqual(["a"]);
  });

  it("keeps POOL_SIZE tasks in flight until one hits", async () => {
    let peak = 0;
    let inFlight = 0;
    const track = (delay: number, pages: string[] | null) => async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, delay));
      inFlight -= 1;
      return pages;
    };

    const result = await racePageSourcesPool(
      [
        track(30, null),
        track(30, null),
        track(30, null),
        track(30, null),
        track(5, ["win"]),
        track(50, ["late"]),
      ],
      PAGE_SOURCE_POOL_SIZE,
    );

    expect(result).toEqual(["win"]);
    expect(peak).toBe(PAGE_SOURCE_POOL_SIZE);
  });

  it("returns null when every source misses", async () => {
    const result = await racePageSourcesPool([
      async () => null,
      async () => [],
      async () => {
        throw new Error("fail");
      },
    ]);
    expect(result).toBeNull();
  });
});
