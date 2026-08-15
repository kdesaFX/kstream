/**
 * Shared surface for the floating controls in the header.
 *
 * These all sit over hero artwork, so any difference in tint source, alpha or
 * blur radius reads as an unrelated panel rather than one toolbar. Everything
 * tints from the `pill-background` theme token so the header follows the
 * active theme instead of hardcoded black.
 */
export const navControlSurface = "bg-pill-background/50 backdrop-blur-lg";

/** Hover/press feedback for the clickable controls on that surface. */
export const navControlHover =
  "transition-[transform,background-color] hover:bg-pill-backgroundHover/80 hover:scale-105 active:scale-95";
