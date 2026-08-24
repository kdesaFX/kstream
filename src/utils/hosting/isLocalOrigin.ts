/** True when the app is served from localhost / 127.0.0.1. */
export function isLocalOrigin(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  return host === "127.0.0.1" || host === "localhost";
}
