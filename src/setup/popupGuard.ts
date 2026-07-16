declare global {
  interface Window {
    __zsPopupAllow?: boolean;
    __zsPopupGuardInstalled?: boolean;
  }
}

export function openWindowSafely(
  url?: string | URL,
  target?: string,
  features?: string,
): WindowProxy | null {
  window.__zsPopupAllow = true;
  try {
    return window.open(url, target, features);
  } finally {
    window.__zsPopupAllow = false;
  }
}

function isWatchPagePath(pathname: string): boolean {
  return pathname.startsWith("/media/");
}


export function installPopupGuard(): void {
  if (typeof window === "undefined") return;
  if (window.__zsPopupGuardInstalled) return;
  window.__zsPopupGuardInstalled = true;

  const nativeOpen = window.open.bind(window);

  window.open = ((...args: Parameters<typeof window.open>) => {
    if (window.__zsPopupAllow) return nativeOpen(...args);
    if (isWatchPagePath(window.location.pathname)) return null;
    return nativeOpen(...args);
  }) as typeof window.open;
}
