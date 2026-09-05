/** @vitest-environment jsdom */
/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import {
  assignCarouselClaims,
  collapseTitleYearDuplicates,
  mediaTitleKey,
  type ClaimableMedia,
} from "@/pages/discover/components/CarouselDedupeContext";

describe("mediaTitleKey", () => {
  it("uses year when release dates are absent (manga cards)", () => {
    expect(
      mediaTitleKey({ id: "a", title: "Berserk", year: 1989 }),
    ).toBe("berserk|1989");
  });

  it("matches the same manga across carousels by title and year", () => {
    const a = mediaTitleKey({ id: "1", title: "Berserk", year: 1989 });
    const b = mediaTitleKey({ id: "2", title: "Berserk", year: 1989 });
    expect(a).toBe(b);
  });

  it("stays stable when year is missing instead of flipping later", () => {
    expect(mediaTitleKey({ id: 42, title: "Ride Your Wave" })).toBe(
      "ride your wave|#42",
    );
  });
});

describe("assignCarouselClaims", () => {
  it("lets lower priority keep a shared title+year", () => {
    const rows = [
      {
        priority: 1,
        items: [{ id: 2, title: "The Odyssey", release_date: "2024-01-01" }],
      },
      {
        priority: 0,
        items: [{ id: 1, title: "The Odyssey", release_date: "2024-01-01" }],
      },
    ];
    const map = assignCarouselClaims(rows);
    expect(map.get(0)).toEqual(["1"]);
    expect(map.get(1)).toEqual([]);
  });

  it("collapses same-title stubs by vote_count before assigning", () => {
    const collapsed = collapseTitleYearDuplicates([
      { id: 1, title: "Dune", release_date: "2021-01-01", vote_count: 10 },
      { id: 2, title: "Dune", release_date: "2021-01-01", vote_count: 900 },
    ]);
    expect(collapsed.map((m) => m.id)).toEqual([2]);

    const map = assignCarouselClaims([
      { priority: 0, items: collapsed },
      {
        priority: 1,
        items: [{ id: 1, title: "Dune", release_date: "2021-01-01" }],
      },
    ]);
    expect(map.get(0)).toEqual(["2"]);
    expect(map.get(1)).toEqual([]);
  });

  it("releases ownership when a row becomes empty", () => {
    const withItems = assignCarouselClaims([
      {
        priority: 0,
        items: [{ id: 1, title: "Solo", release_date: "2018-01-01" }],
      },
      {
        priority: 1,
        items: [{ id: 1, title: "Solo", release_date: "2018-01-01" }],
      },
    ]);
    expect(withItems.get(0)).toEqual(["1"]);
    expect(withItems.get(1)).toEqual([]);

    const released = assignCarouselClaims([
      { priority: 0, items: [] },
      {
        priority: 1,
        items: [{ id: 1, title: "Solo", release_date: "2018-01-01" }],
      },
    ]);
    expect(released.get(0)).toEqual([]);
    expect(released.get(1)).toEqual(["1"]);
  });

  it("lets P0 steal an id that P1 held once P0 includes it", () => {
    const before = assignCarouselClaims([
      { priority: 0, items: [{ id: 9, title: "Other" }] },
      { priority: 1, items: [{ id: 5, title: "Hit" }] },
    ]);
    expect(before.get(1)).toEqual(["5"]);

    const after = assignCarouselClaims([
      { priority: 0, items: [{ id: 5, title: "Hit" }] },
      { priority: 1, items: [{ id: 5, title: "Hit" }] },
    ]);
    expect(after.get(0)).toEqual(["5"]);
    expect(after.get(1)).toEqual([]);
  });

  it("stays O(updates) across many distinct ownership walks", () => {
    let previous: string | null = null;
    for (let n = 0; n < 12; n += 1) {
      const rows = Array.from({ length: n + 1 }, (_, priority) => ({
        priority,
        items: [
          {
            id: 1000 + priority,
            title: `Title ${priority}`,
            release_date: "2020-01-01",
          },
          ...(priority > 0
            ? [
                {
                  id: 1000,
                  title: "Title 0",
                  release_date: "2020-01-01",
                } satisfies ClaimableMedia,
              ]
            : []),
        ],
      }));
      const map = assignCarouselClaims(rows);
      const fp = [...map.entries()]
        .map(([p, ids]) => `${p}:${ids.join(",")}`)
        .sort()
        .join("|");
      expect(fp).not.toBe(previous);
      previous = fp;
      expect(map.get(0)).toEqual(["1000"]);
    }
  });
});
