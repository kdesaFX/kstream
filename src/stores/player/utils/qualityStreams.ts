import type { Stream } from "@p-stream/providers";

import { getCachedMetadata } from "@/backend/helpers/providerApi";
import { convertProviderCaption } from "@/components/player/utils/captions";
import { convertRunoutputToSource } from "@/components/player/utils/convertRunoutputToSource";
import {
  createM3U8ProxyUrl,
  isUrlAlreadyProxied,
} from "@/components/player/utils/proxy";
import type { CaptionListItem } from "@/stores/player/slices/source";
import { resolutionHeightToQuality } from "@/stores/player/utils/qualities";
import type {
  SourceQuality,
  SourceSliceSource,
} from "@/stores/player/utils/qualities";

/**
 * A safety net, not a latency control. The playlist is a few KB, but the CORS
 * proxy has to fetch it from a cold origin first, which regularly takes several
 * seconds — a tight budget here means no alternate qualities at all. Latency
 * comes from racing the reads below instead.
 */
const HLS_PROBE_TIMEOUT_MS = 10_000;

export type QualityStreamOption = {
  id: string;
  quality: SourceQuality;
  sourceId: string;
  /** Human-readable provider name shown next to a cross-source quality. */
  sourceName: string;
  embedId?: string | null;
  source: SourceSliceSource;
  captions: CaptionListItem[];
};

export function sourceDisplayName(sourceId: string): string {
  return (
    getCachedMetadata().find((meta) => meta.id === sourceId)?.name ?? sourceId
  );
}

export function parseHlsQualities(playlist: string): SourceQuality[] {
  const qualities = new Set<SourceQuality>();
  const resolutionPattern = /RESOLUTION\s*=\s*\d+\s*x\s*(\d+)/gi;

  for (const match of playlist.matchAll(resolutionPattern)) {
    const height = Number(match[1]);
    const quality = resolutionHeightToQuality(height);
    if (quality) qualities.add(quality);
  }

  return Array.from(qualities);
}

async function fetchHlsQualities(url: string): Promise<SourceQuality[]> {
  const controller = new AbortController();
  const timer = window.setTimeout(
    () => controller.abort(),
    HLS_PROBE_TIMEOUT_MS,
  );
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      credentials: "omit",
    });
    if (!response.ok) return [];
    return parseHlsQualities(await response.text());
  } catch {
    return [];
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Settle on the first read that actually returned tiers rather than waiting for
 * all of them, so one slow route can't hold up an answer another already has.
 */
export function firstNonEmptyQualities(
  reads: Promise<SourceQuality[]>[],
): Promise<SourceQuality[]> {
  if (!reads.length) return Promise.resolve([]);
  return new Promise((resolve) => {
    let outstanding = reads.length;
    let settled = false;
    const give = (qualities: SourceQuality[]) => {
      if (settled) return;
      if (qualities.length) {
        settled = true;
        resolve(qualities);
        return;
      }
      outstanding -= 1;
      if (outstanding === 0) resolve([]);
    };
    for (const read of reads) read.then(give, () => give([]));
  });
}

async function probeHlsQualities(
  source: SourceSliceSource,
): Promise<SourceQuality[]> {
  if (source.type !== "hls") return [];

  const reads = [fetchHlsQualities(source.url)];

  // Extension-only streams can reject a normal page fetch even though the
  // player loads them with injected headers. Read through the configured proxy
  // alongside the direct attempt rather than after it — running these in
  // sequence meant a stream had to clear two timeouts before giving up.
  if (!isUrlAlreadyProxied(source.url)) {
    try {
      reads.push(
        fetchHlsQualities(
          createM3U8ProxyUrl(
            source.url,
            {
              ...(source.preferredHeaders ?? {}),
              ...(source.headers ?? {}),
            },
            { requireProxy: true },
          ),
        ),
      );
    } catch {
      // No proxy configured — the direct read is all this environment has.
    }
  }

  return firstNonEmptyQualities(reads);
}

async function streamQualities(
  stream: Stream,
  source: SourceSliceSource,
): Promise<SourceQuality[]> {
  if (source.type === "file") {
    return Object.entries(source.qualities)
      .filter(([, value]) => Boolean(value?.url))
      .map(([quality]) => quality as SourceQuality);
  }
  return probeHlsQualities(source);
}

export async function streamToQualityOptions(
  stream: Stream,
  sourceId: string,
  embedId?: string | null,
): Promise<QualityStreamOption[]> {
  const source = convertRunoutputToSource({ stream });
  const qualities = await streamQualities(stream, source);
  const captions = convertProviderCaption(stream.captions);

  const sourceName = sourceDisplayName(sourceId);

  return qualities.map((quality) => ({
    id: `${sourceId}:${embedId ?? "direct"}:${stream.id}:${quality}`,
    quality,
    sourceId,
    sourceName,
    embedId: embedId ?? null,
    source,
    captions,
  }));
}

export async function streamsToQualityOptions(
  streams: Stream[] | undefined,
  sourceId: string,
  embedId?: string | null,
): Promise<QualityStreamOption[]> {
  if (!streams?.length) return [];
  const optionGroups = await Promise.all(
    streams.map((stream) => streamToQualityOptions(stream, sourceId, embedId)),
  );
  return mergeQualityStreamOptions([], optionGroups.flat());
}

/** Prefer one provider per quality; the first (higher-ranked) source wins. */
export function mergeQualityStreamOptions(
  existing: QualityStreamOption[],
  incoming: QualityStreamOption[],
): QualityStreamOption[] {
  const byQuality = new Map<SourceQuality, QualityStreamOption>();
  for (const option of existing) {
    if (!byQuality.has(option.quality)) byQuality.set(option.quality, option);
  }
  for (const option of incoming) {
    if (!byQuality.has(option.quality)) byQuality.set(option.quality, option);
  }
  return Array.from(byQuality.values());
}
