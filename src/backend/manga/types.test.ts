/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import en from "@/assets/locales/en.json";
import type { MangaStatus } from "@/backend/manga/types";
import { mangaStatusKey } from "@/backend/manga/types";

function lookup(key: string): unknown {
  return key
    .split(".")
    .reduce<any>((node, part) => (node == null ? node : node[part]), en);
}

describe("mangaStatusKey", () => {
  const statuses: MangaStatus[] = [
    "ongoing",
    "completed",
    "hiatus",
    "cancelled",
  ];

  it("has a written-out label for every status MangaDex reports", () => {
    for (const status of statuses) {
      const key = mangaStatusKey(status);
      expect(key, status).not.toBeNull();
      // A missing translation would fall back to printing the raw enum.
      expect(typeof lookup(key!), key!).toBe("string");
    }
  });

  it("says nothing at all when the status is unknown", () => {
    expect(mangaStatusKey("unknown")).toBeNull();
  });
});
