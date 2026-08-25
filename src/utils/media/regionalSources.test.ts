/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import {
  excludeDeferredFromPrimary,
  isDeferredRegionalSource,
  orderRegionalCandidates,
  regionalSourcesForLanguages,
} from "@/utils/media/regionalSources";

describe("regionalSources", () => {
  it("flags deferred regional ids", () => {
    expect(isDeferredRegionalSource("cuevana3")).toBe(true);
    expect(isDeferredRegionalSource("oneembed")).toBe(false);
  });

  it("strips deferred sources from primary ordering", () => {
    expect(
      excludeDeferredFromPrimary(["oneembed", "cuevana3", "vixsrc", "nova"]),
    ).toEqual(["oneembed", "nova"]);
  });

  it("lists regional sources for missing languages", () => {
    expect(regionalSourcesForLanguages(new Set(["it"]))).toEqual(["vixsrc"]);
    expect(regionalSourcesForLanguages(new Set(["es"]))).toEqual([
      "cuevana3",
      "cinehdplus",
    ]);
  });

  it("promotes one regional source per missing language", () => {
    const pool = ["oneembed", "cuevana3", "cinehdplus", "vixsrc"];
    const regional = pool.filter((id) =>
      ["cuevana3", "cinehdplus", "vixsrc"].includes(id),
    );
    expect(orderRegionalCandidates(regional, new Set(["en"]))).toEqual([
      "cuevana3",
      "vixsrc",
      "cinehdplus",
    ]);
  });

  it("keeps order when regional languages are already present", () => {
    const regional = ["cuevana3", "cinehdplus", "vixsrc"];
    expect(orderRegionalCandidates(regional, new Set(["en", "es", "it"]))).toEqual(
      regional,
    );
  });
});
