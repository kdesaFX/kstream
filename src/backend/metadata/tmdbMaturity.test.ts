/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import {
  isMatureMovieCertification,
  isMatureTvContentRating,
} from "@/backend/metadata/tmdbMaturity";

describe("tmdbMaturity", () => {
  it("treats US TV-MA and GB 18 as mature", () => {
    expect(isMatureTvContentRating("US", "TV-MA")).toBe(true);
    expect(isMatureTvContentRating("US", "TV-14")).toBe(false);
    expect(isMatureTvContentRating("GB", "18")).toBe(true);
  });

  it("treats US NC-17 and international 18 certs as mature for movies", () => {
    expect(isMatureMovieCertification("US", "NC-17")).toBe(true);
    expect(isMatureMovieCertification("US", "R")).toBe(false);
    expect(isMatureMovieCertification("GB", "18")).toBe(true);
  });
});
