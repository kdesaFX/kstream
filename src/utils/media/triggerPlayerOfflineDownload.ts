import { startDesktopVideoDownload } from "@/backend/video/videoDesktopOffline";
import { unwrapProxiedMediaUrl } from "@/components/player/utils/proxy";
import { usePlayerStore } from "@/stores/player/store";

function mergeDownloadHeaders(
  sourceHeaders?: Record<string, string>,
  preferredHeaders?: Record<string, string>,
  proxyHeaders?: Record<string, string>,
): Record<string, string> {
  return {
    ...(preferredHeaders ?? {}),
    ...(sourceHeaders ?? {}),
    ...(proxyHeaders ?? {}),
  };
}

function resolveDownloadUrlFromPlayer(): {
  url?: string;
  headers: Record<string, string>;
} {
  const { source, currentQuality } = usePlayerStore.getState();
  let raw: string | undefined;

  if (source?.type === "file") {
    const quality = currentQuality
      ? source.qualities[currentQuality]
      : undefined;
    raw = quality?.url ?? Object.values(source.qualities)[0]?.url;
  } else if (source?.type === "hls") {
    raw = source.url;
  }

  if (!raw) return { headers: {} };

  const unwrapped = unwrapProxiedMediaUrl(raw);
  return {
    url: unwrapped.url,
    headers: mergeDownloadHeaders(
      source?.headers,
      source?.preferredHeaders,
      unwrapped.headers,
    ),
  };
}

export async function triggerOfflineDownloadFromPlayerStore(): Promise<boolean> {
  const meta = usePlayerStore.getState().meta;
  const { url, headers } = resolveDownloadUrlFromPlayer();
  if (!meta || !url) return false;

  let title = meta.title;
  if (meta.type === "show" && meta.episode) {
    const season = meta.season?.number;
    title =
      season != null
        ? `${meta.title} S${season}E${meta.episode.number}`
        : `${meta.title} E${meta.episode.number}`;
  }

  await startDesktopVideoDownload({
    url,
    headers,
    title,
    poster: meta.poster,
    type: meta.type,
    seasonNumber: meta.season?.number ?? null,
    episodeNumber: meta.episode?.number ?? null,
  });

  return true;
}
