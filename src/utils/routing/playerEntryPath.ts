import { conf } from "@/setup/config";

/** Pathname for boot-time checks (supports hash router). */
export function getAppPathname(): string {
  if (conf().NORMAL_ROUTER) return window.location.pathname;
  const hash = window.location.hash.replace(/^#/, "");
  const path = hash.split("?")[0] ?? "";
  if (!path) return window.location.pathname;
  return path.startsWith("/") ? path : `/${path}`;
}

/** Deep-linked player routes should not sit behind the global boot splash. */
export function isDeepLinkPlayerPath(pathname = getAppPathname()): boolean {
  return pathname.startsWith("/media/") || pathname.startsWith("/manga/");
}
