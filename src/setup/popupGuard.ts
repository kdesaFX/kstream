declare global {
  interface Window {
    __zsPopupAllow?: boolean;
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
