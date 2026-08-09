import { ReactNode, useEffect, useState } from "react";

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

function WindowButton(props: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
      className={
        props.danger
          ? "kstream-desktop-titlebar__btn kstream-desktop-titlebar__btn--close"
          : "kstream-desktop-titlebar__btn"
      }
    >
      {props.children}
    </button>
  );
}

/**
 * Frameless Electron title bar is injected by the desktop shell
 * (`kstream-native-titlebar`). This React fallback only runs if that
 * injection is missing (e.g. older desktop builds).
 */
export function DesktopTitleBar() {
  const isDesktop = useIsDesktopApp();
  const [maximized, setMaximized] = useState(false);
  const [useFallback, setUseFallback] = useState(false);
  const controls =
    typeof window !== "undefined"
      ? window.desktopApi?.windowControls
      : undefined;

  useEffect(() => {
    if (!isDesktop) return;
    document.documentElement.classList.add("is-desktop-app");
    const native = Boolean(
      (window as Window & { __KSTREAM_NATIVE_TITLEBAR__?: boolean })
        .__KSTREAM_NATIVE_TITLEBAR__ ||
        document.getElementById("kstream-native-titlebar"),
    );
    setUseFallback(!native);
    return () => {
      document.documentElement.classList.remove("is-desktop-app");
    };
  }, [isDesktop]);

  useEffect(() => {
    if (!controls?.isMaximized) return;
    let cancelled = false;
    void controls.isMaximized().then((value) => {
      if (!cancelled) setMaximized(Boolean(value));
    });
    return () => {
      cancelled = true;
    };
  }, [controls]);

  if (!isDesktop || !useFallback) return null;

  return (
    <div
      className="kstream-desktop-titlebar"
      role="banner"
      aria-label="kstream"
    >
      <div className="kstream-desktop-titlebar__brand">
        <TitleBarLogo />
        <span className="kstream-desktop-titlebar__name">kstream</span>
      </div>
      {controls ? (
        <div className="kstream-desktop-titlebar__controls">
          <WindowButton
            label="Minimize"
            onClick={() => {
              void controls.minimize();
            }}
          >
            <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden>
              <rect x="1" y="5.5" width="10" height="1" fill="currentColor" />
            </svg>
          </WindowButton>
          <WindowButton
            label={maximized ? "Restore" : "Maximize"}
            onClick={() => {
              void controls.maximize().then((value) => {
                setMaximized(Boolean(value));
              });
            }}
          >
            {maximized ? (
              <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden>
                <path
                  d="M3.5 1.5h7v7h-1.5V3H3.5V1.5zM1.5 3.5h7v7h-7v-7z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden>
                <rect
                  x="1.5"
                  y="1.5"
                  width="9"
                  height="9"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                />
              </svg>
            )}
          </WindowButton>
          <WindowButton
            label="Close"
            danger
            onClick={() => {
              void controls.close();
            }}
          >
            <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden>
              <path
                d="M2.2 2.2l7.6 7.6M9.8 2.2L2.2 9.8"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
          </WindowButton>
        </div>
      ) : null}
    </div>
  );
}
