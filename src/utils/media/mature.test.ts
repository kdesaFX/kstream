/* eslint-disable import/no-extraneous-dependencies */
import { beforeEach, describe, expect, it } from "vitest";

import { usePreferencesStore } from "@/stores/preferences";
import {
  filterOutMatureMedia,
  isMatureMedia,
  tmdbIncludeAdult,
} from "@/utils/media/mature";

describe("mature media helpers", () => {
  beforeEach(() => {
    usePreferencesStore.setState({ enableMatureTitles: false });
  });

  it("treats only the TMDB adult flag as mature", () => {
    expect(isMatureMedia({ adult: true })).toBe(true);
    expect(isMatureMedia({ adult: false })).toBe(false);
    expect(isMatureMedia({})).toBe(false);
  });

  it("hides adult titles from browse lists while the preference is off", () => {
    expect(
      filterOutMatureMedia([
        { id: 1, adult: true },
        { id: 2, adult: false },
        { id: 3 },
      ]),
    ).toEqual([
      { id: 2, adult: false },
      { id: 3 },
    ]);
    expect(tmdbIncludeAdult()).toBe(false);
  });

  it("keeps adult titles once the preference is on", () => {
    usePreferencesStore.setState({ enableMatureTitles: true });
    const items = [
      { id: 1, adult: true },
      { id: 2, adult: false },
    ];
    expect(filterOutMatureMedia(items)).toEqual(items);
    expect(tmdbIncludeAdult()).toBe(true);
  });
});
