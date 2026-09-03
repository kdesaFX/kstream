/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import { mediaTitleKey } from "@/pages/discover/components/CarouselDedupeContext";

describe("mediaTitleKey", () => {
  it("uses year when release dates are absent (manga cards)", () => {
    expect(
      mediaTitleKey({ id: "a", title: "Berserk", year: 1989 }),
    ).toBe("berserk|1989");
  });

  it("matches the same manga across carousels by title and year", () => {
    const a = mediaTitleKey({ id: "1", title: "Berserk", year: 1989 });
    const b = mediaTitleKey({ id: "2", title: "Berserk", year: 1989 });
    expect(a).toBe(b);
  });

  it("stays stable when year is missing instead of flipping later", () => {
    expect(mediaTitleKey({ id: 42, title: "Ride Your Wave" })).toBe(
      "ride your wave|#42",
    );
  });
});
