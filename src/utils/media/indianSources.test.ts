/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import {
  CASTLETV_SOURCE_ID,
  excludeCastletvFromNonIndianAutoScrape,
  isIndianTitle,
  prioritizeIndianSources,
} from "@/utils/media/indianSources";

describe("indianSources", () => {
  it("detects Indian origin country", () => {
    expect(isIndianTitle({ originCountry: ["IN"], genreIds: [10764] })).toBe(
      true,
    );
    expect(isIndianTitle({ originCountry: ["US"], genreIds: [18] })).toBe(
      false,
    );
  });

  it("detects Hindi language titles", () => {
    expect(isIndianTitle({ originalLanguage: "hi", genreIds: [10764] })).toBe(
      true,
    );
  });

  it("prioritizes castletv for Indian titles", () => {
    const order = prioritizeIndianSources(
      ["sevenmovies", CASTLETV_SOURCE_ID, "mdesa"],
      { originCountry: ["IN"], genreIds: [10764] },
    );
    expect(order[0]).toBe(CASTLETV_SOURCE_ID);
  });

  it("leaves order unchanged for western titles", () => {
    const ids = ["sevenmovies", CASTLETV_SOURCE_ID, "mdesa"];
    expect(
      prioritizeIndianSources(ids, { originCountry: ["US"], genreIds: [18] }),
    ).toEqual(ids);
  });

  it("drops castletv from auto-scrape on non-Indian titles", () => {
    expect(
      excludeCastletvFromNonIndianAutoScrape(
        ["sevenmovies", CASTLETV_SOURCE_ID, "mdesa"],
        { originCountry: ["US"], genreIds: [18] },
      ),
    ).toEqual(["sevenmovies", "mdesa"]);
  });

  it("keeps castletv in auto-scrape for Indian titles", () => {
    expect(
      excludeCastletvFromNonIndianAutoScrape(
        ["sevenmovies", CASTLETV_SOURCE_ID],
        { originCountry: ["IN"], genreIds: [10764] },
      ),
    ).toEqual(["sevenmovies", CASTLETV_SOURCE_ID]);
  });
});
