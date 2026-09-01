export type TmdbPersistentCacheKey = {
  url: string;
  params: object;
  language: string;
};

function desktopIpc() {
  if (typeof window === "undefined") return null;
  return window.__KSTREAM_DESKTOP_IPC__ ?? null;
}

export function canUseDesktopTmdbCache(): boolean {
  return Boolean(desktopIpc()?.invoke);
}

export async function getDesktopTmdbCache<T>(
  key: TmdbPersistentCacheKey,
): Promise<T | null> {
  const ipc = desktopIpc();
  if (!ipc) return null;
  try {
    const res = await ipc.invoke("tmdbCacheGet", { key });
    return (res ?? null) as T | null;
  } catch {
    return null;
  }
}

export async function getStaleDesktopTmdbCache<T>(
  key: TmdbPersistentCacheKey,
): Promise<T | null> {
  const ipc = desktopIpc();
  if (!ipc) return null;
  try {
    const res = await ipc.invoke("tmdbCacheGet", { key, allowStale: true });
    return (res ?? null) as T | null;
  } catch {
    return null;
  }
}

export function setDesktopTmdbCache(
  key: TmdbPersistentCacheKey,
  value: unknown,
  ttlSec?: number,
): void {
  const ipc = desktopIpc();
  if (!ipc) return;
  void ipc.invoke("tmdbCacheSet", { key, value, ttlSec }).catch(() => {
    /* best-effort */
  });
}
