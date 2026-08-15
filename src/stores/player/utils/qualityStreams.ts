import type { Stream } from "@p-stream/providers";

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

const HLS_PROBE_TIMEOUT_MS = 8_000;

export type QualityStreamOption = {
  id: string;
  quality: SourceQuality;
  sourceId: string;
  embedId?: string | null;
  source: SourceSliceSource;
  captions: CaptionListItem[];
};

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

async function probeHlsQualities(
  source: SourceSliceSource,
): Promise<SourceQuality[]> {
  if (source.type !== "hls") return [];

  const directQualities = await fetchHlsQualities(source.url);
  if (directQualities.length || isUrlAlreadyProxied(source.url)) {
    return directQualities;
  }

  // Extension-only streams can reject a normal page fetch even though the
  // player loads them with injected headers. Probe through the configured
  // proxy without replacing the active stream's extension rule.
  try {
    const proxyUrl = createM3U8ProxyUrl(
      source.url,
      {
        ...(source.preferredHeaders ?? {}),
        ...(source.headers ?? {}),
      },
      { requireProxy: true },
    );
    return fetchHlsQualities(proxyUrl);
  } catch {
    return [];
  }
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

  return qualities.map((quality) => ({
    id: `${sourceId}:${embedId ?? "direct"}:${stream.id}:${quality}`,
    quality,
    sourceId,
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
