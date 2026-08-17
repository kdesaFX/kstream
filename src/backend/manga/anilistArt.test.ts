/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import { buildArtQuery } from "@/backend/manga/anilistArt";

describe("buildArtQuery", () => {
  it("declares one variable and one alias per title", () => {
    const query = buildArtQuery(3);

    expect(query).toContain("query ($s0: String, $s1: String, $s2: String)");
    expect(query).toContain("m0: Page(perPage: 1)");
    expect(query).toContain("m2: Page(perPage: 1)");
    expect(query).not.toContain("m3:");
  });

  it("searches manga through Page so an unknown title can't void the batch", () => {
    const query = buildArtQuery(1);

    expect(query).toContain("media(search: $s0, type: MANGA)");
    expect(query).toContain("bannerImage");
    expect(query).toContain("averageScore");
  });
});
