/**
 * Device profile / low-performance flags are for browse UI (home, discover,
 * posters, carousels). Playback must never read them for stream quality, HLS
 * ladders, or scrape resolution.
 */

const PLAYER_ROUTE = /^\/media\//;

export function isPlayerRoute(pathname: string): boolean {
  return PLAYER_ROUTE.test(pathname);
}

/** True when browse-only perf tweaks (image fades, flares, etc.) may apply. */
export function shouldUseBrowsePerformance(
  pathname: string,
  enableLowPerformanceMode: boolean,
): boolean {
  return enableLowPerformanceMode && !isPlayerRoute(pathname);
}
