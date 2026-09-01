/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import {
  resolveMirrorChapters,
  type MirrorChapter,
} from "./manga-chapters-server";

describe("manga-chapters-server", () => {
  it(
    "resolves Frieren chapters from WeebCentral",
    async () => {
      const result = await resolveMirrorChapters(
        "Frieren: Beyond Journey's End",
        ["Sousou no Frieren"],
        "en",
      );
      expect(result.chapters.length).toBeGreaterThan(50);
      expect(
        result.chapters.some((ch: MirrorChapter) => ch.source === "weebcentral"),
      ).toBe(true);
    },
    60000,
  );
});
