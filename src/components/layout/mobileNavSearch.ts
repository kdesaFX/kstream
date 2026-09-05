/**
 * Mobile bottom-nav Search must reveal the sticky nav search bar.
 * Featured home uses minimalMobile (logo only) — without this signal there is
 * no `input[name=kstream-nav-search]` in the DOM to focus.
 */

type Listener = () => void;
const listeners = new Set<Listener>();

export function requestMobileNavSearch() {
  listeners.forEach((listener) => listener());
  // Also try a delayed DOM focus for pages that already show the bar.
  window.scrollTo({ top: 0, behavior: "smooth" });
  window.setTimeout(() => {
    document
      .querySelector<HTMLInputElement>('input[name="kstream-nav-search"]')
      ?.focus({ preventScroll: true });
  }, 280);
}

export function subscribeMobileNavSearch(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
