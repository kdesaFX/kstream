import { useEffect, useRef, useState } from "react";

/** Matches layout breakpoints used for ad slots (< 1024px = mobile/tablet). */
export const MOBILE_LAYOUT_MAX_WIDTH = 1024;

export function isMobileViewport(horizontal?: boolean): boolean {
  if (typeof window === "undefined") return false;
  return horizontal
    ? window.innerHeight < 600
    : window.innerWidth < MOBILE_LAYOUT_MAX_WIDTH;
}

export function useIsMobile(horizontal?: boolean) {
  const [isMobile, setIsMobile] = useState(() => isMobileViewport(horizontal));
  const isMobileCurrent = useRef<boolean | null>(null);

  useEffect(() => {
    function onResize() {
      const value = isMobileViewport(horizontal);
      const isChanged = isMobileCurrent.current !== value;
      if (!isChanged) return;

      isMobileCurrent.current = value;
      setIsMobile(value);
    }

    onResize();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, [horizontal]);

  return {
    isMobile,
  };
}

export function useIsPWA() {
  return window.matchMedia("(display-mode: standalone)").matches;
}

export function useIsIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}
