/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import { scrollTargetFor } from "./useScrollRestoration";

describe("scrollTargetFor", () => {
  it("sends new navigations to the top", () => {
    expect(scrollTargetFor("PUSH", "", 900)).toBe(0);
    expect(scrollTargetFor("REPLACE", "", 900)).toBe(0);
  });

  it("puts back/forward where the entry was left", () => {
    expect(scrollTargetFor("POP", "", 900)).toBe(900);
  });

  it("goes to the top when the entry was never scrolled", () => {
    expect(scrollTargetFor("POP", "", undefined)).toBe(0);
  });

  it("leaves hash links to scroll themselves", () => {
    expect(scrollTargetFor("PUSH", "#enable-mature-titles", undefined)).toBeNull();
  });
});
