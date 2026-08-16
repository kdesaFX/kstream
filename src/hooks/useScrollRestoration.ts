import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * How long a restore keeps chasing its offset. Search results and Discover
 * rows arrive over the network, so the page is usually far too short to hold
 * the old offset at the moment we return to it.
 */
const RESTORE_WINDOW_MS = 2000;

/** Scroll offset per history entry, so back/forward can land where it left. */
const offsets = new Map<string, number>();

function maxScroll(): number {
  return Math.max(document.documentElement.scrollHeight - window.innerHeight, 0);
}

/**
 * Where a navigation should leave the page: an offset to scroll to, or null to
 * leave the scroll alone (the page owns it, e.g. a hash target).
 *
 * Resetting every navigation is right for links but wrong for the back button:
 * it dumped viewers at the top of a list they'd scrolled deep into, leaving
 * them to find the poster they'd just been looking at all over again.
 */
export function scrollTargetFor(
  navigationType: string,
  hash: string,
  saved: number | undefined,
): number | null {
  if (hash) return null;
  if (navigationType === "POP" && saved !== undefined) return saved;
  return 0;
}

/** Top on a new page, previous offset on back/forward. */
export function useScrollRestoration() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const key = location.key;
  const keyRef = useRef(key);

  useEffect(() => {
    keyRef.current = key;
    const record = () => offsets.set(keyRef.current, window.scrollY);
    window.addEventListener("scroll", record, { passive: true });
    return () => window.removeEventListener("scroll", record);
  }, [key]);

  useEffect(() => {
    const saved = scrollTargetFor(
      navigationType,
      location.hash,
      offsets.get(key),
    );
    if (saved === null) return undefined;
    if (saved === 0) {
      window.scrollTo(0, 0);
      return undefined;
    }

    let frame = 0;
    let done = false;
    const startedAt = Date.now();
    const stop = () => {
      done = true;
      if (frame) cancelAnimationFrame(frame);
    };

    const attempt = () => {
      if (done) return;
      window.scrollTo(0, Math.min(saved, maxScroll()));
      // Give up once the page is tall enough to honour the offset, or once
      // whatever is still loading has had its chance.
      if (maxScroll() >= saved || Date.now() - startedAt > RESTORE_WINDOW_MS) {
        stop();
        return;
      }
      frame = requestAnimationFrame(attempt);
    };
    attempt();

    // A viewer who starts scrolling has chosen where to be; stop fighting them.
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchstart", stop, { passive: true });
    window.addEventListener("keydown", stop);

    return () => {
      stop();
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchstart", stop);
      window.removeEventListener("keydown", stop);
    };
  }, [key, location.hash, navigationType]);
}
