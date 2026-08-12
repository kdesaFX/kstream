/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import {
  currentSourceAfterUpdate,
  currentSourceOnStart,
  parentSourceId,
  shouldIgnoreStaleProgress,
} from "@/hooks/scrapeEvents";
import type { ScrapingItems, ScrapingSegment } from "@/hooks/scrapeEvents";

function seg(
  id: string,
  status: ScrapingSegment["status"],
): ScrapingSegment {
  return { id, name: id, status, percentage: 0 };
}

const order: ScrapingItems[] = [
  { id: "oneembed", children: [] },
  { id: "reyna", children: [] },
  { id: "fsonline", children: [] },
];

describe("scrape race focus", () => {
  it("does not jump the list to the second racer while the first is still pending", () => {
    const sources = {
      oneembed: seg("oneembed", "pending"),
      reyna: seg("reyna", "waiting"),
      fsonline: seg("fsonline", "waiting"),
    };
    expect(
      currentSourceOnStart("oneembed", "reyna", sources, order),
    ).toBe("oneembed");
  });

  it("follows embed starts under the focused source", () => {
    const embedOrder: ScrapingItems[] = [
      { id: "tqq", children: ["tqq-0", "tqq-1"] },
      { id: "reyna", children: [] },
    ];
    const sources = {
      tqq: seg("tqq", "pending"),
      "tqq-0": seg("tqq-0", "pending"),
      "tqq-1": seg("tqq-1", "waiting"),
      reyna: seg("reyna", "pending"),
    };
    expect(currentSourceOnStart("tqq", "tqq-0", sources, embedOrder)).toBe(
      "tqq-0",
    );
    expect(currentSourceOnStart("tqq-0", "tqq-1", sources, embedOrder)).toBe(
      "tqq-1",
    );
  });

  it("after 1Embed misses, focuses the still-pending racer", () => {
    const sources = {
      oneembed: seg("oneembed", "notfound"),
      reyna: seg("reyna", "pending"),
      fsonline: seg("fsonline", "waiting"),
    };
    expect(currentSourceAfterUpdate("oneembed", sources, order)).toBe("reyna");
  });

  it("ignores progress updates after a source already settled", () => {
    expect(
      shouldIgnoreStaleProgress(seg("oneembed", "notfound"), "pending"),
    ).toBe(true);
    expect(
      shouldIgnoreStaleProgress(seg("oneembed", "success"), "pending"),
    ).toBe(true);
    expect(
      shouldIgnoreStaleProgress(seg("oneembed", "pending"), "pending"),
    ).toBe(false);
  });

  it("parentSourceId maps embed rows back to the source card", () => {
    const embedOrder: ScrapingItems[] = [
      { id: "tqq", children: ["tqq-0"] },
    ];
    expect(parentSourceId("tqq-0", embedOrder)).toBe("tqq");
    expect(parentSourceId("tqq", embedOrder)).toBe("tqq");
  });
});
