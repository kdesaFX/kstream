/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import { filterUnavailableSourceIds } from "@/backend/providers/sourceAvailability";

describe("filterUnavailableSourceIds", () => {
  it("removes Reyna while preserving every working source and its order", () => {
    expect(
      filterUnavailableSourceIds([
        "oneembed",
        "reyna",
        "7movies",
        "fsonline",
      ]),
    ).toEqual(["oneembed", "7movies", "fsonline"]);
  });

  it("does not mutate the provider list", () => {
    const sourceIds = ["reyna", "7movies"];
    filterUnavailableSourceIds(sourceIds);
    expect(sourceIds).toEqual(["reyna", "7movies"]);
  });
});
