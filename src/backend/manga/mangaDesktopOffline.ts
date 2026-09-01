export type MangaOfflineDownloadRequest = {
  chapterId: string;
  mangaId?: string;
  title?: string;
  chapterLabel?: string;
  pages: string[];
};

function desktopIpc() {
  if (typeof window === "undefined") return null;
  return window.__KSTREAM_DESKTOP_IPC__ ?? null;
}

export function canUseMangaOffline(): boolean {
  return Boolean(desktopIpc()?.invoke);
}

export async function getDesktopOfflineMangaPages(
  chapterId: string,
): Promise<string[] | null> {
  const ipc = desktopIpc();
  if (!ipc) return null;
  try {
    const res = await ipc.invoke("mangaOfflineGetPages", { chapterId });
    return Array.isArray(res) && res.length > 0 ? res : null;
  } catch {
    return null;
  }
}

export async function hasDesktopOfflineMangaChapter(
  chapterId: string,
): Promise<boolean> {
  const ipc = desktopIpc();
  if (!ipc) return false;
  try {
    return Boolean(await ipc.invoke("mangaOfflineHas", { chapterId }));
  } catch {
    return false;
  }
}

export async function downloadDesktopMangaChapter(
  body: MangaOfflineDownloadRequest,
): Promise<{ ok: boolean; pageCount?: number }> {
  const ipc = desktopIpc();
  if (!ipc) throw new Error("Desktop offline downloads are unavailable");
  const res = await ipc.invoke("mangaOfflineDownload", body);
  if (!res || typeof res !== "object" || !res.ok) {
    throw new Error("Failed to save chapter offline");
  }
  return res as { ok: boolean; pageCount?: number };
}
