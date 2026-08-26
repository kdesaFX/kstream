const RELOAD_KEY = "kstream:stale-chunk-reload";

/** True when a lazy/dynamic import failed because the hashed chunk is gone. */
export function isStaleChunkError(error: unknown): boolean {
  if (!error) return false;
  const msg = String(
    (error as { message?: unknown }).message ?? error,
  ).toLowerCase();
  return (
    msg.includes("failed to fetch dynamically imported module") ||
    msg.includes("error loading dynamically imported module") ||
    msg.includes("importing a module script failed") ||
    msg.includes("error loading module")
  );
}

/**
 * Hard-reload once after a deploy left the tab on an old entry that points
 * at deleted `/assets/*.js` chunks. Session guard avoids a reload loop.
 */
export function reloadOnceForStaleChunk(): boolean {
  try {
    if (sessionStorage.getItem(RELOAD_KEY) === "1") return false;
    sessionStorage.setItem(RELOAD_KEY, "1");
  } catch {
    // Private mode / blocked storage — still try one reload.
  }
  window.location.reload();
  return true;
}

/** Clear the guard after a successful boot so a later deploy can recover again. */
export function clearStaleChunkReloadGuard(): void {
  try {
    sessionStorage.removeItem(RELOAD_KEY);
  } catch {
    // ignore
  }
}
