/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import { shouldDismissOnBackdropClick } from "@/components/overlays/OverlayDisplay";

describe("shouldDismissOnBackdropClick", () => {
  it("dismisses a deliberate click on the backdrop", () => {
    expect(shouldDismissOnBackdropClick(1, 5000)).toBe(true);
  });

  it("ignores the second click of a double-click", () => {
    expect(shouldDismissOnBackdropClick(2, 5000)).toBe(false);
  });

  it("ignores clicks that arrive while the overlay is still appearing", () => {
    expect(shouldDismissOnBackdropClick(1, 20)).toBe(false);
  });

  it("dismisses again once the overlay has settled", () => {
    expect(shouldDismissOnBackdropClick(1, 400)).toBe(true);
  });
});
