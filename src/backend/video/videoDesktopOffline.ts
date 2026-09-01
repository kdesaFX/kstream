export type VideoOfflineDownloadRequest = {
  url: string;
  title: string;
  poster?: string | null;
  type?: string;
  mediaType?: string;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  headers?: Record<string, string>;
};

export type VideoOfflineItem = {
  id: string;
  title: string;
  poster?: string | null;
  mediaType?: string;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  status: "downloading" | "ready" | "error";
  progress?: number;
  error?: string | null;
  startedAt?: number;
  savedAt?: number | null;
  fileSize?: number;
  playbackUrl?: string | null;
};

function desktopIpc() {
  if (typeof window === "undefined") return null;
  return window.__KSTREAM_DESKTOP_IPC__ ?? null;
}

export function canUseVideoOffline(): boolean {
  return Boolean(desktopIpc()?.invoke);
}

export async function startDesktopVideoDownload(
  body: VideoOfflineDownloadRequest,
): Promise<{ ok: boolean; id?: string }> {
  const ipc = desktopIpc();
  if (!ipc) throw new Error("Desktop offline downloads are unavailable");
  const res = await ipc.invoke("videoOfflineStart", body);
  if (!res || typeof res !== "object" || !res.ok) {
    throw new Error("Failed to start offline download");
  }
  return res as { ok: boolean; id?: string };
}

export async function listDesktopVideoDownloads(): Promise<VideoOfflineItem[]> {
  const ipc = desktopIpc();
  if (!ipc) return [];
  try {
    const res = await ipc.invoke("videoOfflineList");
    return Array.isArray(res?.items) ? res.items : [];
  } catch {
    return [];
  }
}

export async function deleteDesktopVideoDownload(id: string): Promise<void> {
  const ipc = desktopIpc();
  if (!ipc) return;
  await ipc.invoke("videoOfflineDelete", { id });
}
