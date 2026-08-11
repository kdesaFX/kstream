/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import {
  mergeUniqueCaptions,
  shouldStartExternalSubtitleScrape,
} from "./externalSubtitleCache";

describe("externalSubtitleCache", () => {
  it("starts at most one subtitle scrape per media session", () => {
    expect(shouldStartExternalSubtitleScrape("movie-767", null)).toBe(true);
    expect(
      shouldStartExternalSubtitleScrape("movie-767", "movie-767"),
    ).toBe(false);
    expect(
      shouldStartExternalSubtitleScrape("movie-768", "movie-767"),
    ).toBe(true);
  });

  it("reuses external captions without duplicating provider captions", () => {
    const providerCaptions = [
      { id: "provider-1", language: "en" },
      { id: "shared", language: "es" },
    ];
    const externalCaptions = [
      { id: "external-1", language: "fr" },
      { id: "shared", language: "es" },
    ];

    expect(
      mergeUniqueCaptions(providerCaptions, externalCaptions).map(
        (caption) => caption.id,
      ),
    ).toEqual(["provider-1", "shared", "external-1"]);
  });
});
