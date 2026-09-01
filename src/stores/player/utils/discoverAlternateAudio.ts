import { ScrapeMedia, Stream } from "@p-stream/providers";

import { isExtensionActiveCached } from "@/backend/extension/messaging";
import { prepareStream } from "@/backend/extension/streams";
import { getProviders } from "@/backend/providers/providers";
import { getMediaKey, playerStatus } from "@/stores/player/slices/source";
import { usePlayerStore } from "@/stores/player/store";
import { streamsToAudioOptions } from "@/stores/player/utils/audioStreams";
import {
  streamPeakQualityRank,
  streamsToQualityOptions,
} from "@/stores/player/utils/qualityStreams";
import { highestAvailableQuality } from "@/stores/player/utils/qualities";
import {
  isDeferredRegionalSource,
  missingRegionalLanguages,
  orderRankedCandidates,
  orderRegionalCandidates,
} from "@/utils/media/regionalSources";

const DEFAULT_MAX_SOURCE_ATTEMPTS = 8;
const REGIONAL_DISCOVERY_MAX_ATTEMPTS = 10;
const DISCOVERY_START_DELAY_MS = 1_500;
const BETWEEN_SOURCE_YIELD_MS = 350;
const DISCOVERY_CONCURRENCY = 3;
const WORKER_STAGGER_MS = 150;

function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function haveEnoughLanguages(languages: Set<string>): boolean {
  if (languages.has("en") && languages.has("es")) return true;
  return languages.size >= 2;
}

function currentQualities(): Set<string> {
  const store = usePlayerStore.getState();
  return new Set([
    ...store.qualities,
    ...store.qualityStreamOptions.map((option) => option.quality),
  ]);
}

function haveEnoughQualities(qualities: Set<string>): boolean {
  return ["360", "480", "720", "1080", "4k"].every((quality) =>
    qualities.has(quality),
  );
}

function haveEnoughAlternates(): boolean {
  return (
    haveEnoughLanguages(currentLanguages()) &&
    haveEnoughQualities(currentQualities())
  );
}

function currentLanguages(): Set<string> {
  return new Set(
    usePlayerStore
      .getState()
      .audioStreamOptions.map((o) => o.language.trim())
      .filter(Boolean),
  );
}

function stillSameMedia(mediaKey: string): boolean {
  const store = usePlayerStore.getState();
  return (
    getMediaKey(store.meta) === mediaKey &&
    store.status === playerStatus.PLAYING
  );
}

export function buildDiscoveryCandidates(
  sourceIds: string[],
  have: Set<string>,
): string[] {
  const regional = sourceIds.filter(isDeferredRegionalSource);
  const ranked = sourceIds.filter((id) => !isDeferredRegionalSource(id));
  return [
    ...orderRegionalCandidates(regional, have),
    ...orderRankedCandidates(ranked),
  ];
}

/** @deprecated Use buildDiscoveryCandidates — kept for unit tests. */
export function orderCandidates(
  sourceIds: string[],
  have: Set<string>,
): string[] {
  return buildDiscoveryCandidates(sourceIds, have);
}

function currentPeakQualityRank(): number {
  const store = usePlayerStore.getState();
  const tiers = [
    ...store.qualities,
    ...store.qualityStreamOptions.map((option) => option.quality),
    ...store.rememberedQualityTiers,
  ];
  if (store.currentQuality && store.currentQuality !== "unknown") {
    tiers.push(store.currentQuality);
  }
  const peak = highestAvailableQuality(tiers);
  if (!peak || peak === "unknown") return 0;
  const rankMap: Record<string, number> = {
    "360": 1,
    "480": 2,
    "720": 3,
    "1080": 4,
    "4k": 5,
  };
  return rankMap[peak] ?? 0;
}

async function registerStreams(
  streams: Stream[],
  sourceId: string,
  embedId: string | null,
  mediaKey: string,
): Promise<void> {
  const have = currentLanguages();
  const peakRank = currentPeakQualityRank();
  const missing = streams.filter((stream) => {
    const lang = stream.audioLanguage?.trim();
    if (!lang || have.has(lang)) return false;
    // Regional dubs scraped at much lower tiers are not alternates for what
    // you're watching — they belong in quality/source pickers, not Languages.
    if (peakRank > 0 && streamPeakQualityRank(stream) < peakRank - 1) {
      return false;
    }
    return true;
  });
  if (missing.length && isExtensionActiveCached()) {
    try {
      await prepareStream(missing[0]);
    } catch {
      // still register; playback path will prepare again on switch
    }
  }

  const store = usePlayerStore.getState();
  if (missing.length) {
    store.registerAudioStreamOptions(
      streamsToAudioOptions(missing, sourceId, embedId),
    );
  }
  store.registerSourceMirrors(sourceId, streams, null);
  void streamsToQualityOptions(streams, sourceId, embedId).then((options) => {
    if (!stillSameMedia(mediaKey)) return;
    usePlayerStore.getState().registerQualityStreamOptions(options);
  });
}

async function scrapeCandidate(
  sourceId: string,
  media: ScrapeMedia,
  mediaKey: string,
): Promise<void> {
  const providers = getProviders();
  const result = await providers.runSourceScraper({ id: sourceId, media });
  if (!stillSameMedia(mediaKey)) return;

  if (result.stream?.length) {
    await registerStreams(result.stream, sourceId, null, mediaKey);
    return;
  }

  for (const embed of result.embeds ?? []) {
    if (!stillSameMedia(mediaKey)) return;
    if (haveEnoughAlternates()) return;

    try {
      const embedResult = await providers.runEmbedScraper({
        id: embed.embedId,
        url: embed.url,
      });
      if (!stillSameMedia(mediaKey)) return;
      await registerStreams(
        embedResult.stream,
        sourceId,
        embed.embedId,
        mediaKey,
      );
    } catch {
      // try next embed
    }
  }
}

/**
 * After primary playback starts, quietly scrape regional dub sources and other
 * ranked sources for extra audio languages / quality tiers.
 */
export async function discoverAlternateAudioLanguages(opts: {
  media: ScrapeMedia;
  mediaKey: string;
  skipSourceId: string;
  maxAttempts?: number;
}): Promise<void> {
  await delay(DISCOVERY_START_DELAY_MS);
  if (!stillSameMedia(opts.mediaKey)) return;

  const have = currentLanguages();
  const regionalMissing = missingRegionalLanguages(have);
  const maxAttempts =
    opts.maxAttempts ??
    (regionalMissing.size > 0
      ? REGIONAL_DISCOVERY_MAX_ATTEMPTS
      : DEFAULT_MAX_SOURCE_ATTEMPTS);

  const providers = getProviders();
  const failed =
    usePlayerStore.getState().failedSourcesPerMedia[opts.mediaKey] ?? [];

  const candidates = buildDiscoveryCandidates(
    providers
      .listSources()
      .map((s) => s.id)
      .filter((id) => id !== opts.skipSourceId && !failed.includes(id)),
    have,
  );

  if (haveEnoughAlternates()) return;

  let cursor = 0;
  let attempts = 0;

  async function worker(stagger: number): Promise<void> {
    await delay(stagger);

    for (;;) {
      if (!stillSameMedia(opts.mediaKey)) return;
      if (haveEnoughAlternates()) return;
      if (attempts >= maxAttempts) return;

      const sourceId = candidates[cursor];
      if (!sourceId) return;
      cursor += 1;
      attempts += 1;

      try {
        await scrapeCandidate(sourceId, opts.media, opts.mediaKey);
      } catch {
        // try next source
      }

      await delay(BETWEEN_SOURCE_YIELD_MS);
    }
  }

  const workerCount = Math.min(DISCOVERY_CONCURRENCY, candidates.length);
  await Promise.all(
    Array.from({ length: workerCount }, (_, index) =>
      worker(index * WORKER_STAGGER_MS),
    ),
  );
}
