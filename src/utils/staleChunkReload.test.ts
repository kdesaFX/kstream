/* eslint-disable import/no-extraneous-dependencies */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearStaleChunkReloadGuard,
  isStaleChunkError,
  reloadOnceForStaleChunk,
} from "@/utils/staleChunkReload";

describe("staleChunkReload", () => {
  afterEach(() => {
    clearStaleChunkReloadGuard();
    vi.restoreAllMocks();
  });

  it("detects dynamic import failures", () => {
    expect(
      isStaleChunkError(
        new TypeError(
          "error loading dynamically imported module: https://kdesa.stream/assets/MyAlgorithm-Bit5iqOp.js",
        ),
      ),
    ).toBe(true);
    expect(isStaleChunkError(new Error("random"))).toBe(false);
  });

  it("reloads only once per session", () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { reload });
    expect(reloadOnceForStaleChunk()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(reloadOnceForStaleChunk()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
