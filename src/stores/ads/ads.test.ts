/* eslint-disable import/no-extraneous-dependencies */
import { afterEach, describe, expect, it, vi } from "vitest";

import { areAdsBlocked } from "@/stores/ads";

describe("areAdsBlocked", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("blocks when user opted out", () => {
    expect(areAdsBlocked(true)).toBe(true);
  });

  it("blocks on mobile viewport", () => {
    vi.stubGlobal("window", {
      innerWidth: 390,
      innerHeight: 844,
      __PSTREAM_DESKTOP__: undefined,
      __KSTREAM_DESKTOP_IPC__: undefined,
    });
    expect(areAdsBlocked(false)).toBe(true);
  });

  it("allows desktop viewport when ads enabled", () => {
    vi.stubGlobal("window", {
      innerWidth: 1280,
      innerHeight: 800,
      __PSTREAM_DESKTOP__: undefined,
      __KSTREAM_DESKTOP_IPC__: undefined,
    });
    expect(areAdsBlocked(false)).toBe(false);
  });
});
