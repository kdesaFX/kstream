import { useEffect } from "react";

import { useIsDesktopApp } from "@/hooks/useIsDesktopApp";

/** Compact logo matching the desktop welcome / tray brand. */
function TitleBarLogo() {
  return (
    <svg
      viewBox="0 0 128 128"
      className="h-4 w-4 shrink-0"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="64" cy="64" r="18" fill="#6eecd9" />
      <path
        d="M38 44c-10 8-10 32 0 40"
        stroke="#6eecd9"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path
        d="M90 44c10 8 10 32 0 40"
        stroke="#6eecd9"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path
        d="M24 32c-16 14-16 50 0 64"
        stroke="#6eecd9"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path
        d="M104 32c16 14 16 50 0 64"
        stroke="#6eecd9"
        strokeWidth="10"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Frameless Electron title-bar brand strip. Window min/max/close come from
 * Electron `titleBarOverlay`; this fills the left drag region.
 */
export function DesktopTitleBar() {
  const isDesktop = useIsDesktopApp();

  useEffect(() => {
    if (!isDesktop) return;
    document.documentElement.classList.add("is-desktop-app");
    return () => {
      document.documentElement.classList.remove("is-desktop-app");
    };
  }, [isDesktop]);

  if (!isDesktop) return null;

  return (
    <div
      className="kstream-desktop-titlebar"
      role="banner"
      aria-label="kstream"
    >
      <TitleBarLogo />
      <span className="kstream-desktop-titlebar__name">kstream</span>
    </div>
  );
}
