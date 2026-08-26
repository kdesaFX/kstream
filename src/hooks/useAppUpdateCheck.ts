import { useEffect, useState } from "react";

import { useIsDesktopApp } from "@/hooks/useIsDesktopApp";

const DISMISSED_KEY = "zstream::update-dismissed-version";
const CHECK_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes — catch deploys sooner
const FIRST_CHECK_MS = 15_000; // don't compete with first paint

async function fetchLatestVersion(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.version === "string" ? data.version : null;
  } catch {
    return null;
  }
}

export function useAppUpdateCheck() {
  const [newVersion, setNewVersion] = useState<string | null>(null);
  const isDesktop = useIsDesktopApp();

  useEffect(() => {
    // Desktop uses electron-updater; skip the web version.json poll.
    if (isDesktop) return;

    let cancelled = false;

    const check = async () => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        return;
      }
      const latest = await fetchLatestVersion();
      if (cancelled || !latest || latest === __BUILD_ID__) return;
      let dismissed = "";
      try {
        dismissed = localStorage.getItem(DISMISSED_KEY) ?? "";
      } catch {
        dismissed = "";
      }
      if (latest === dismissed) return;
      setNewVersion(latest);
    };

    const first = window.setTimeout(check, FIRST_CHECK_MS);
    const interval = window.setInterval(check, CHECK_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    const onOnline = () => check();
    const onPageShow = (event: PageTransitionEvent) => {
      // bfcache restore after deploy — re-check immediately.
      if (event.persisted) check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [isDesktop]);

  const dismiss = () => {
    if (newVersion) {
      try {
        localStorage.setItem(DISMISSED_KEY, newVersion);
      } catch {
        // ignore
      }
    }
    setNewVersion(null);
  };

  return { updateAvailable: newVersion !== null, dismiss };
}
