import { useEffect, useRef } from "react";

import { getClientPlatform } from "@/hooks/useIsDesktopApp";

/** Once per tab — Rybbit may load after first paint. */
export function useClientPlatformAnalytics() {
  const fired = useRef(false);

  useEffect(() => {
    const fire = () => {
      if (fired.current || !window.rybbit) return false;
      fired.current = true;
      window.rybbit.event("app_open", { platform: getClientPlatform() });
      return true;
    };

    if (fire()) return;

    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (fire() || attempts >= 24) window.clearInterval(timer);
    }, 250);

    return () => window.clearInterval(timer);
  }, []);
}
