/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import {
  currentSourceAfterUpdate,
  currentSourceOnStart,
  foldSingleEmbed,
  parentSourceId,
  shouldIgnoreStaleProgress,
} from "@/hooks/scrapeEvents";
import type { ScrapingItems, ScrapingSegment } from "@/hooks/scrapeEvents";

function seg(id: string, status: ScrapingSegment["status"]): ScrapingSegment {
  return { id, name: id, status, percentage: 0 };
}

const order: ScrapingItems[] = [
  { id: "oneembed", children: [] },
  { id: "reyna", children: [] },
  { id: "mdesa", children: [] },
];

describe("scrape race focus", () => {
  it("does not jump the list to the second racer while the first is still pending", () => {
    const sources = {
      oneembed: seg("oneembed", "pending"),
      reyna: seg("reyna", "waiting"),
      mdesa: seg("mdesa", "waiting"),
    };
    expect(currentSourceOnStart("oneembed", "reyna", sources, order)).toBe(
      "oneembed",
    );
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
      mdesa: seg("mdesa", "waiting"),
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
    const embedOrder: ScrapingItems[] = [{ id: "tqq", children: ["tqq-0"] }];
    expect(parentSourceId("tqq-0", embedOrder)).toBe("tqq");
    expect(parentSourceId("tqq", embedOrder)).toBe("tqq");
  });
});

describe("foldSingleEmbed", () => {
  it("reports the lone embed's outcome on the source itself", () => {
    const parent = seg("reyna", "pending");
    const child: ScrapingSegment = {
      ...seg("reyna-0", "notfound"),
      percentage: 100,
      reason: "No streams found",
    };

    expect(foldSingleEmbed(parent, [child])).toMatchObject({
      id: "reyna",
      name: "reyna",
      status: "notfound",
      percentage: 100,
      reason: "No streams found",
    });
  });

  it("leaves a multi-embed source alone", () => {
    const parent = seg("tqq", "pending");
    const children = [seg("tqq-0", "notfound"), seg("tqq-1", "pending")];

    expect(foldSingleEmbed(parent, children)).toBe(parent);
  });

  it("keeps the source spinning until its embed starts", () => {
    const parent = seg("reyna", "pending");

    expect(foldSingleEmbed(parent, [seg("reyna-0", "waiting")])).toBe(parent);
  });

  it("does not undo a source the run already settled as the winner", () => {
    const parent = seg("reyna", "success");

    expect(foldSingleEmbed(parent, [seg("reyna-0", "notfound")])).toBe(parent);
  });
});
