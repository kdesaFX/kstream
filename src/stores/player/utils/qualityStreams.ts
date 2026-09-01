import type { Stream } from "@p-stream/providers";

import { getCachedMetadata } from "@/backend/helpers/providerApi";
import { convertProviderCaption } from "@/components/player/utils/captions";
import {
  convertRunoutputToSource,
  requiresSameOriginProxy,
} from "@/components/player/utils/convertRunoutputToSource";
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

const QUALITY_RANK: Record<SourceQuality, number> = {
  unknown: 0,
  "360": 1,
  "480": 2,
  "720": 3,
  "1080": 4,
  "4k": 5,
};

/** Highest labeled tier on a file stream; HLS mirrors rely on provider order. */
export function streamPeakQualityRank(stream: Stream): number {
  if (stream.type === "file") {
    let max = 0;
    for (const quality of Object.keys(stream.qualities) as SourceQuality[]) {
      if (stream.qualities[quality]?.url) {
        max = Math.max(max, QUALITY_RANK[quality] ?? 0);
      }
    }
    return max;
  }
  return 0;
}

/** Best-first order for scrape validation and playback (Nova ships mirrors best-first). */
export function orderStreamsForPlayback(
  streams: Stream[],
  preferredLanguage?: string | null,
): Stream[] {
  const preferred = preferredLanguage?.trim();
  const indexed = streams.map((stream, index) => ({ stream, index }));
  return indexed
    .sort((a, b) => {
      const langA = a.stream.audioLanguage?.trim();
      const langB = b.stream.audioLanguage?.trim();
      if (preferred) {
        const matchA = langA === preferred ? 1 : 0;
        const matchB = langB === preferred ? 1 : 0;
        if (matchA !== matchB) return matchB - matchA;
      }
      const rankDiff =
        streamPeakQualityRank(b.stream) - streamPeakQualityRank(a.stream);
      if (rankDiff !== 0) return rankDiff;
      return a.index - b.index;
    })
    .map((entry) => entry.stream);
}

export function pickBestQualityStream(
  streams: Stream[],
  preferredLanguage?: string | null,
  fallback?: Stream,
): Stream {
  if (!streams.length) {
    if (!fallback) throw new Error("pickBestQualityStream: no streams");
    return fallback;
  }
  return (
    orderStreamsForPlayback(streams, preferredLanguage)[0] ?? fallback ?? streams[0]
  );
}

/**
 * A safety net, not a latency control. The playlist is a few KB, but the CORS
 * proxy has to fetch it from a cold origin first, which regularly takes several
 * seconds — a tight budget here means no alternate qualities at all. Latency
 * comes from racing the reads below instead.
 */
const HLS_PROBE_TIMEOUT_MS = 6_000;

export type QualityStreamOption = {
  id: string;
  quality: SourceQuality;
  sourceId: string;
  /** Human-readable provider name shown next to a cross-source quality. */
  sourceName: string;
  /** Audio languages that can actually play at this quality tier. */
  languages: string[];
  embedId?: string | null;
  source: SourceSliceSource;
  captions: CaptionListItem[];
};

/** One selectable row when several sources share a quality tier. */
export type QualityTierChoice =
  | {
      kind: "current";
      quality: SourceQuality;
      sourceId: string;
      sourceName: string;
      languages: string[];
    }
  | {
      kind: "alternate";
      option: QualityStreamOption;
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

const identified = new Map<string, Promise<SourceQuality[]>>();
const IDENTIFIED_MAX = 100;

/**
 * Which tiers a ladder offers can't change while the tab is open, so identify
 * a playlist once and reuse the answer. Concurrent callers share the in-flight
 * read; a read that came back with nothing is dropped so a blip doesn't hide a
 * source for the rest of the session.
 */
export function rememberIdentifiedQualities(
  key: string,
  identify: () => Promise<SourceQuality[]>,
): Promise<SourceQuality[]> {
  const known = identified.get(key);
  if (known) return known;

  const pending = identify().then((qualities) => {
    if (!qualities.length) identified.delete(key);
    return qualities;
  });

  if (identified.size >= IDENTIFIED_MAX) {
    const oldest = identified.keys().next();
    if (!oldest.done) identified.delete(oldest.value);
  }
  identified.set(key, pending);
  return pending;
}

async function readHlsQualities(
  source: SourceSliceSource,
): Promise<SourceQuality[]> {
  if (source.type !== "hls") return [];

  const headers = {
    ...(source.preferredHeaders ?? {}),
    ...(source.headers ?? {}),
  };
  const originGated = requiresSameOriginProxy(source.url);

  const reads: Promise<SourceQuality[]>[] = [];

  // Origin-gated playlists (Way2, Nova, Reyna) always 403 on a bare page
  // fetch — skip the doomed direct attempt so quality discovery starts faster.
  if (!originGated && !isUrlAlreadyProxied(source.url)) {
    reads.push(fetchHlsQualities(source.url));
  }

  if (!isUrlAlreadyProxied(source.url) || originGated) {
    try {
      reads.push(
        fetchHlsQualities(
          createM3U8ProxyUrl(source.url, headers, {
            requireProxy: originGated,
          }),
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
  // A file stream already told us its tiers — nothing to go and read.
  if (source.type === "file") {
    return Object.entries(source.qualities)
      .filter(([, value]) => Boolean(value?.url))
      .map(([quality]) => quality as SourceQuality);
  }
  return rememberIdentifiedQualities(source.url, () =>
    readHlsQualities(source),
  );
}

/**
 * "unknown" means the provider gave a quality label we couldn't read, not a
 * tier worth switching to. Listing it turns the menu into a coin flip — the
 * row says nothing about what you'd get, and it is usually a progressive MP4
 * the player has no proxy for, so choosing it just kills playback. Sources may
 * still play an unknown-quality stream as their own; it simply isn't offered
 * as a destination.
 */
function isOfferableTier(quality: SourceQuality): boolean {
  return quality !== "unknown";
}

function streamLanguageCodes(stream: Stream): string[] {
  const raw = stream.audioLanguage?.trim();
  if (!raw || raw === "unknown" || raw === "und") return [];
  return [raw.toLowerCase()];
}

export async function streamToQualityOptions(
  stream: Stream,
  sourceId: string,
  embedId?: string | null,
): Promise<QualityStreamOption[]> {
  const source = convertRunoutputToSource({ stream });
  const qualities = await streamQualities(stream, source);
  const captions = convertProviderCaption(stream.captions);
  const languages = streamLanguageCodes(stream);

  const sourceName = sourceDisplayName(sourceId);

  return qualities.filter(isOfferableTier).map((quality) => ({
    id: `${sourceId}:${embedId ?? "direct"}:${stream.id}:${quality}`,
    quality,
    sourceId,
    sourceName,
    languages,
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
  // Nova and similar sources return many mirror URLs. Probing every mirror
  // hammers the proxy and fills the quality menu with duplicate rows.
  const primary = pickBestQualityStream(streams);
  return streamToQualityOptions(primary, sourceId, embedId);
}

/** Every tier the menu can act on, whether it needs a source hop or not. */
export function selectableQualityTiers(
  available: SourceQuality[],
  alternates: QualityStreamOption[],
): SourceQuality[] {
  return Array.from(
    new Set([...available, ...alternates.map((option) => option.quality)]),
  );
}

/**
 * Which tiers need a different provider, and which one.
 *
 * The source you're on always wins, so a tier is only labelled when that source
 * genuinely can't serve it: not in its ladder, not the tier playing right now,
 * and not something it registered itself. A label also occupies the slot the
 * selected tick draws in, so labelling the current row would hide the tick.
 * When several alternates share a tier, no single label is shown — the source
 * picker sub-menu lists them instead.
 */
export function alternateSourceLabels(opts: {
  available: SourceQuality[];
  alternates: QualityStreamOption[];
  currentQuality: SourceQuality | null;
  currentSourceId: string | null;
}): Partial<Record<SourceQuality, string>> {
  const byQuality = new Map<SourceQuality, QualityStreamOption[]>();
  for (const option of opts.alternates) {
    if (option.quality === opts.currentQuality) continue;
    if (opts.available.includes(option.quality)) continue;
    if (option.sourceId === opts.currentSourceId) continue;
    const list = byQuality.get(option.quality) ?? [];
    list.push(option);
    byQuality.set(option.quality, list);
  }

  const labels: Partial<Record<SourceQuality, string>> = {};
  for (const [quality, options] of byQuality) {
    if (options.length === 1) labels[quality] = options[0]!.sourceName;
  }
  return labels;
}

/** Every source the user can pick at a given quality tier. */
export function choicesForQualityTier(opts: {
  quality: SourceQuality;
  available: SourceQuality[];
  alternates: QualityStreamOption[];
  currentSourceId: string | null;
  currentLanguage?: string | null;
}): QualityTierChoice[] {
  const out: QualityTierChoice[] = [];
  const seenAlternateKeys = new Set<string>();

  if (opts.available.includes(opts.quality) && opts.currentSourceId) {
    const raw = opts.currentLanguage?.trim().toLowerCase();
    const languages =
      raw && raw !== "unknown" && raw !== "und" ? [raw] : [];
    out.push({
      kind: "current",
      quality: opts.quality,
      sourceId: opts.currentSourceId,
      sourceName: sourceDisplayName(opts.currentSourceId),
      languages,
    });
  }

  for (const option of opts.alternates) {
    if (option.quality !== opts.quality) continue;
    if (
      option.sourceId === opts.currentSourceId &&
      opts.available.includes(opts.quality)
    ) {
      continue;
    }
    const langKey = option.languages.join(",");
    const dedupeKey = `${option.sourceId}:${option.quality}:${langKey}`;
    if (seenAlternateKeys.has(dedupeKey)) continue;
    seenAlternateKeys.add(dedupeKey);
    out.push({ kind: "alternate", option });
  }

  return out;
}

export function hasMultipleQualityChoices(
  quality: SourceQuality,
  opts: Omit<Parameters<typeof choicesForQualityTier>[0], "quality">,
): boolean {
  return choicesForQualityTier({ ...opts, quality }).length > 1;
}

/** Dedupe by option id so multiple sources can share a tier. */
export function mergeQualityStreamOptions(
  existing: QualityStreamOption[],
  incoming: QualityStreamOption[],
): QualityStreamOption[] {
  const byId = new Map<string, QualityStreamOption>();
  for (const option of [...existing, ...incoming]) {
    byId.set(option.id, option);
  }
  return Array.from(byId.values());
}

function uniqueLanguages(languages: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of languages) {
    const lang = raw.trim().toLowerCase();
    if (!lang || lang === "unknown" || lang === "und" || seen.has(lang)) {
      continue;
    }
    seen.add(lang);
    out.push(lang);
  }
  return out;
}

/** Languages offered at each quality tier (current ladder + discovered streams). */
export function languagesByQuality(opts: {
  available: SourceQuality[];
  currentLanguage?: string | null;
  alternates: QualityStreamOption[];
}): Partial<Record<SourceQuality, string[]>> {
  const map = new Map<SourceQuality, string[]>();
  const add = (quality: SourceQuality, languages: string[]) => {
    map.set(
      quality,
      uniqueLanguages([...(map.get(quality) ?? []), ...languages]),
    );
  };

  for (const option of opts.alternates) {
    add(option.quality, option.languages);
  }

  const current = opts.currentLanguage?.trim().toLowerCase();
  if (current && current !== "unknown" && current !== "und") {
    for (const quality of opts.available) {
      add(quality, [current]);
    }
  }

  const sorted: Partial<Record<SourceQuality, string[]>> = {};
  for (const [quality, languages] of map) {
    sorted[quality] = [...languages].sort((a, b) => {
      if (a === "en") return -1;
      if (b === "en") return 1;
      return a.localeCompare(b);
    });
  }
  return sorted;
}
