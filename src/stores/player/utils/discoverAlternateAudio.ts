import { ScrapeMedia, Stream } from "@p-stream/providers";

import { isExtensionActiveCached } from "@/backend/extension/messaging";
import { prepareStream } from "@/backend/extension/streams";
import { getProviders } from "@/backend/providers/providers";
import { getMediaKey, playerStatus } from "@/stores/player/slices/source";
import { usePlayerStore } from "@/stores/player/store";
import { streamsToAudioOptions } from "@/stores/player/utils/audioStreams";
import { streamsToQualityOptions } from "@/stores/player/utils/qualityStreams";

const DEFAULT_MAX_SOURCE_ATTEMPTS = 5;
/**
 * Let the primary stream get its first fragments away before scraping others.
 * Scrapes are small API calls rather than media, so this only has to clear the
 * initial burst — a longer head start just delays the alternate options.
 */
const DISCOVERY_START_DELAY_MS = 1_500;
const BETWEEN_SOURCE_YIELD_MS = 350;
/**
 * Probe a few providers at once. Sequential scraping meant the first alternate
 * option waited on the slowest earlier source, which took ~10s to surface.
 */
const DISCOVERY_CONCURRENCY = 3;
const WORKER_STAGGER_MS = 150;

function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/** Sources known to often provide Spanish audio — try early when `es` is missing. */
const SPANISH_LEANING_SOURCES = new Set([
  "pelisplushd",
  "cuevana3",
  "cinehdplus",
]);

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

function orderCandidates(sourceIds: string[], have: Set<string>): string[] {
  const prefer: string[] = [];
  const rest: string[] = [];
  for (const id of sourceIds) {
    const wantSpanish = !have.has("es") && SPANISH_LEANING_SOURCES.has(id);
    if (wantSpanish) prefer.push(id);
    else rest.push(id);
  }
  return [...prefer, ...rest];
}

async function registerStreams(
  streams: Stream[],
  sourceId: string,
  embedId: string | null,
  mediaKey: string,
): Promise<void> {
  // Read languages live — workers run concurrently, so a captured snapshot
  // goes stale as soon as a sibling registers something.
  const have = currentLanguages();
  const missing = streams.filter((stream) => {
    const lang = stream.audioLanguage?.trim();
    return lang && !have.has(lang);
  });
  // One prepareStream call is enough for extension proxy warmup when an
  // alternate audio stream needs registering.
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
  // Identifying which tiers a stream offers means reading the other source's
  // manifest, and a cold origin can take its time. Nothing here depends on the
  // answer — the menu just gains rows once it lands — so don't hold this
  // source, or the ones queued behind it, waiting for the read.
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
 * After primary playback starts, quietly scrape other sources for streams that
 * expose a different audioLanguage or additional quality tiers.
 * Non-blocking; aborts if the user leaves the title.
 */
export async function discoverAlternateAudioLanguages(opts: {
  media: ScrapeMedia;
  mediaKey: string;
  skipSourceId: string;
  maxAttempts?: number;
}): Promise<void> {
  await delay(DISCOVERY_START_DELAY_MS);
  if (!stillSameMedia(opts.mediaKey)) return;

  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_SOURCE_ATTEMPTS;
  const providers = getProviders();
  const failed =
    usePlayerStore.getState().failedSourcesPerMedia[opts.mediaKey] ?? [];

  const candidates = orderCandidates(
    providers
      .listSources()
      .map((s) => s.id)
      .filter((id) => id !== opts.skipSourceId && !failed.includes(id)),
    currentLanguages(),
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
