/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import {
  decodeMangaSeeChapterNumber,
  encodeMangaSeeChapterPath,
} from "@/backend/manga/sources/mangasee";

describe("mangasee chapter encoding", () => {
  it("decodes packed chapter numbers", () => {
    expect(decodeMangaSeeChapterNumber("100010")).toBe("1");
    expect(decodeMangaSeeChapterNumber("101145")).toBe("114.5");
  });

  it("encodes chapter paths for image URLs", () => {
    expect(encodeMangaSeeChapterPath("114")).toBe("0114");
    expect(encodeMangaSeeChapterPath("114.5")).toBe("0114.5");
    expect(encodeMangaSeeChapterPath("1")).toBe("0001");
  });
});
