/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { peekPersistedHasItems } from "@/hooks/usePersistedStoreHydrated";

describe("peekPersistedHasItems", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it("returns false when nothing is stored", () => {
    expect(peekPersistedHasItems("__MW::progress")).toBe(false);
  });

  it("detects persisted progress items", () => {
    localStorage.setItem(
      "__MW::progress",
      JSON.stringify({ state: { items: { a: { id: "a" } } } }),
    );
    expect(peekPersistedHasItems("__MW::progress")).toBe(true);
  });

  it("detects persisted bookmarks", () => {
    localStorage.setItem(
      "__MW::bookmarks",
      JSON.stringify({ state: { bookmarks: { a: { id: "a" } } } }),
    );
    expect(peekPersistedHasItems("__MW::bookmarks")).toBe(true);
  });
});
