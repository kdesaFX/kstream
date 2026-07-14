
const nativeOpen = window.open.bind(window);
let allowedOnce = false;

export function installPopupGuard() {
  window.open = ((...args: Parameters<typeof window.open>) => {
    if (allowedOnce) {
      return nativeOpen(...args);
    }
    // eslint-disable-next-line no-console
    console.warn("[popup-guard] blocked an unexpected window.open() call:", args[0]);
    return null;
  }) as typeof window.open;
}


export function openWindowSafely(
  url?: string | URL,
  target?: string,
  features?: string,
): WindowProxy | null {
  allowedOnce = true;
  try {
    return nativeOpen(url, target, features);
  } finally {
    allowedOnce = false;
  }
}
