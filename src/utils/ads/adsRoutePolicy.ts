/**
 * Banner / popunder ads are allowed on home and adjacent browse pages only —
 * never during playback or manga reading.
 *
 * Keep in sync with `public/inject-popunder.js` (`isPopunderPath` / player block).
 */
export function areBannerAdsAllowedOnPath(pathname: string): boolean {
  const path = pathname || "/";
  if (path.startsWith("/media/")) return false;
  if (path.startsWith("/manga/")) return false;
  return true;
}

export function isPopunderAllowedOnPath(pathname: string): boolean {
  if (!areBannerAdsAllowedOnPath(pathname)) return false;
  const path = pathname || "/";
  if (path === "/") return true;
  if (path === "/browse" || path.startsWith("/browse/")) return true;
  if (path === "/read-history") return true;
  if (path === "/algorithm") return true;
  if (path === "/about") return true;
  return false;
}
