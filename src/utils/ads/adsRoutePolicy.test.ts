/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import {
  areBannerAdsAllowedOnPath,
  isPopunderAllowedOnPath,
} from "@/utils/ads/adsRoutePolicy";

describe("areBannerAdsAllowedOnPath", () => {
  it("allows home and browse", () => {
    expect(areBannerAdsAllowedOnPath("/")).toBe(true);
    expect(areBannerAdsAllowedOnPath("/browse/trending")).toBe(true);
  });

  it("blocks player and manga reader", () => {
    expect(areBannerAdsAllowedOnPath("/media/tmdb-tv-1-show")).toBe(false);
    expect(
      areBannerAdsAllowedOnPath("/media/tmdb-tv-1-show/2/3"),
    ).toBe(false);
    expect(areBannerAdsAllowedOnPath("/manga/one-piece")).toBe(false);
  });
});

describe("isPopunderAllowedOnPath", () => {
  it("allows only the home-adjacent list", () => {
    expect(isPopunderAllowedOnPath("/")).toBe(true);
    expect(isPopunderAllowedOnPath("/about")).toBe(true);
    expect(isPopunderAllowedOnPath("/settings")).toBe(false);
    expect(isPopunderAllowedOnPath("/media/tmdb-movie-1")).toBe(false);
  });
});
