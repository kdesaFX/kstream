/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import { orderCandidates } from "@/stores/player/utils/discoverAlternateAudio";

// Ranked best-first, with the Spanish-leaning providers sitting further down.
const ranked = [
  "reyna",
  "oneembed",
  "pelisplushd",
  "fsonline",
  "cuevana3",
  "cinehdplus",
];

describe("orderCandidates", () => {
  it("lets a single Spanish-leaning source jump the queue when es is missing", () => {
    expect(orderCandidates(ranked, new Set(["en"]))).toEqual([
      "pelisplushd",
      "reyna",
      "oneembed",
      "fsonline",
      "cuevana3",
      "cinehdplus",
    ]);
  });

  it("keeps the ranked order once Spanish audio is already known", () => {
    expect(orderCandidates(ranked, new Set(["en", "es"]))).toEqual(ranked);
  });

  it("leaves enough of a short budget for the ranked sources", () => {
    // The budget that matters is the front of the list, since discovery stops
    // after a fixed number of attempts.
    const front = orderCandidates(ranked, new Set()).slice(0, 4);

    expect(front.filter((id) => id === "pelisplushd")).toHaveLength(1);
    expect(front).toContain("reyna");
    expect(front).toContain("oneembed");
    expect(front).toContain("fsonline");
  });
});
