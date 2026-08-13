/* eslint-disable import/no-extraneous-dependencies */
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { isDesktopApp } from "@/hooks/useIsDesktopApp";

afterEach(() => {
  delete window.__PSTREAM_DESKTOP__;
  delete window.__KSTREAM_DESKTOP_IPC__;
});

describe("isDesktopApp", () => {
  it("returns false in a regular browser", () => {
    expect(isDesktopApp()).toBe(false);
  });

  it("detects the desktop preload flag", () => {
    window.__PSTREAM_DESKTOP__ = true;

    expect(isDesktopApp()).toBe(true);
  });

  it("detects the desktop IPC bridge", () => {
    window.__KSTREAM_DESKTOP_IPC__ = {
      invoke: async () => undefined,
    };

    expect(isDesktopApp()).toBe(true);
  });
});
