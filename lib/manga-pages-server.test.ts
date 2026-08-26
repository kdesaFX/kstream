/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import {
  isComickChapterId,
  isMangaDexChapterId,
  isWeebCentralChapterId,
  proxyPageUrl,
} from "./manga-pages-server";

describe("manga-pages-server", () => {
  it("detects chapter id formats", () => {
    expect(isComickChapterId("comick-abc123")).toBe(true);
    expect(isWeebCentralChapterId("01J76XYCPSY3C4BNPBRY8JMCBE")).toBe(true);
    expect(
      isMangaDexChapterId("a1b2c3d4-e5f6-7890-abcd-ef1234567890"),
    ).toBe(true);
  });

  it("wraps image URLs for the site proxy", () => {
    const wrapped = proxyPageUrl("https://meo.comick.pictures/foo/bar.webp");
    expect(wrapped).toContain("/api/proxy?destination=");
    expect(wrapped).toContain(encodeURIComponent("https://meo.comick.pictures/foo/bar.webp"));
  });
});
