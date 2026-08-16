import { useEffect } from "react";

/**
 * Put the page back where it was when an overlay releases the scroll lock.
 *
 * Overlays hide overflow on <html>. Firefox and Safari clamp the offset of a
 * root that can no longer scroll, so the page rewinds to the top on open and
 * stays there after close: opening a dialog costs the viewer their place in
 * whatever list they were reading. Chrome keeps the offset, so this is a no-op
 * there.
 */
export function useScrollLockRestore() {
  useEffect(() => {
    const html = document.documentElement;
    const isLocked = () => html.hasAttribute("data-no-scroll");

    let locked = isLocked();
    let offset = window.scrollY;
    let lockedPath = window.location.pathname;

    const observer = new MutationObserver(() => {
      const nowLocked = isLocked();
      if (nowLocked === locked) return;
      locked = nowLocked;

      if (nowLocked) {
        offset = window.scrollY;
        lockedPath = window.location.pathname;
        return;
      }
      // An overlay that navigated on its way out (play, open details) left a
      // different page behind, and that page owns its own offset.
      if (window.location.pathname !== lockedPath) return;
      if (window.scrollY !== offset) window.scrollTo(0, offset);
    });

    observer.observe(html, {
      attributes: true,
      attributeFilter: ["data-no-scroll"],
    });
    return () => observer.disconnect();
  }, []);
}
