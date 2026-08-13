/* eslint-disable import/no-extraneous-dependencies */
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { getGlobalSetupState } from "@/pages/parts/settings/SetupPart";

describe("getGlobalSetupState", () => {
  it("treats a completed default setup as successful", () => {
    expect(
      getGlobalSetupState({
        extension: "unset",
        proxy: "unset",
        defaultProxy: "success",
      }),
    ).toBe("success");
  });

  it("keeps setup unset before any option is completed", () => {
    expect(
      getGlobalSetupState({
        extension: "unset",
        proxy: "unset",
        defaultProxy: "unset",
      }),
    ).toBe("unset");
  });

  it("prioritizes setup errors over completed options", () => {
    expect(
      getGlobalSetupState({
        extension: "error",
        proxy: "unset",
        defaultProxy: "success",
      }),
    ).toBe("error");
  });
});
