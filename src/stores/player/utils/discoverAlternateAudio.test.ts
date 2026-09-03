/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import {
  buildDiscoveryCandidates,
  orderCandidates,
} from "@/stores/player/utils/discoverAlternateAudio";

const ranked = ["reyna", "oneembed", "mdesa", "sevenmovies"];

describe("buildDiscoveryCandidates", () => {
  it("promotes regional sources when their languages are missing", () => {
    expect(
      buildDiscoveryCandidates(
        [...ranked, "lisbon", "cinehdplus", "vixsrc"],
        new Set(["en"]),
      ),
    ).toEqual([
      "lisbon",
      "vixsrc",
      "cinehdplus",
      ...ranked,
    ]);
  });

  it("keeps ranked order when regional languages are already known", () => {
    const ids = [...ranked, "lisbon", "cinehdplus", "vixsrc"];
    expect(
      buildDiscoveryCandidates(ids, new Set(["en", "es", "it"])),
    ).toEqual(["lisbon", "cinehdplus", "vixsrc", ...ranked]);
  });

  it("leaves ranked sources in the discovery budget after regional promotion", () => {
    const front = buildDiscoveryCandidates(
      [...ranked, "lisbon", "cinehdplus", "vixsrc"],
      new Set(),
    ).slice(0, 4);

    expect(front.filter((id) => id === "lisbon")).toHaveLength(1);
    expect(front).toContain("vixsrc");
    expect(front).toContain("reyna");
    expect(front.filter((id) => ranked.includes(id)).length).toBeGreaterThan(0);
  });
});

describe("orderCandidates", () => {
  it("mirrors buildDiscoveryCandidates for compatibility", () => {
    expect(orderCandidates(["reyna", "lisbon"], new Set(["en"]))).toEqual([
      "lisbon",
      "reyna",
    ]);
  });
});
