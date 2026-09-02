/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it, vi } from "vitest";

import {
  getAppPathname,
  isDeepLinkPlayerPath,
} from "@/utils/routing/playerEntryPath";

describe("playerEntryPath", () => {
  it("detects media and manga deep links", () => {
    expect(isDeepLinkPlayerPath("/media/tmdb-123")).toBe(true);
    expect(isDeepLinkPlayerPath("/media/tmdb-123/season/ep")).toBe(true);
    expect(isDeepLinkPlayerPath("/manga/abc")).toBe(true);
    expect(isDeepLinkPlayerPath("/")).toBe(false);
    expect(isDeepLinkPlayerPath("/browse")).toBe(false);
  });

  it("reads pathname from the hash when not using the normal router", () => {
    vi.stubGlobal("location", {
      pathname: "/",
      hash: "#/media/tmdb-abc/season/episode",
    });
    expect(getAppPathname()).toBe("/media/tmdb-abc/season/episode");
    vi.unstubAllGlobals();
  });
});
