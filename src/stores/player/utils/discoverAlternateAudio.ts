import { ScrapeMedia, Stream } from "@p-stream/providers";

import { isExtensionActiveCached } from "@/backend/extension/messaging";
import { prepareStream } from "@/backend/extension/streams";
import { getProviders } from "@/backend/providers/providers";
import { getMediaKey, playerStatus } from "@/stores/player/slices/source";
import { usePlayerStore } from "@/stores/player/store";
import { streamsToAudioOptions } from "@/stores/player/utils/audioStreams";
import { streamsToQualityOptions } from "@/stores/player/utils/qualityStreams";

const DEFAULT_MAX_SOURCE_ATTEMPTS = 5;
/** Let the primary stream buffer before burning bandwidth on alt audio. */
const DISCOVERY_START_DELAY_MS = 4_000;
const BETWEEN_SOURCE_YIELD_MS = 350;

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
  have: Set<string>,
  mediaKey: string,
): Promise<Set<string>> {
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
  const qualityOptions = await streamsToQualityOptions(
    streams,
    sourceId,
    embedId,
  );
  if (!stillSameMedia(mediaKey)) return have;
  usePlayerStore.getState().registerQualityStreamOptions(qualityOptions);

  return currentLanguages();
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
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, DISCOVERY_START_DELAY_MS);
  });
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

  let attempts = 0;
  let have = currentLanguages();
  if (haveEnoughAlternates()) return;

  for (const sourceId of candidates) {
    if (attempts >= maxAttempts) break;
    if (!stillSameMedia(opts.mediaKey)) return;
    if (haveEnoughAlternates()) return;

    attempts += 1;

    try {
      const result = await providers.runSourceScraper({
        id: sourceId,
        media: opts.media,
      });
      if (!stillSameMedia(opts.mediaKey)) return;

      if (result.stream?.length) {
        have = await registerStreams(
          result.stream,
          sourceId,
          null,
          have,
          opts.mediaKey,
        );
      } else {
        for (const embed of result.embeds ?? []) {
          if (!stillSameMedia(opts.mediaKey)) return;
          if (haveEnoughAlternates()) return;

          try {
            const embedResult = await providers.runEmbedScraper({
              id: embed.embedId,
              url: embed.url,
            });
            if (!stillSameMedia(opts.mediaKey)) return;
            have = await registerStreams(
              embedResult.stream,
              sourceId,
              embed.embedId,
              have,
              opts.mediaKey,
            );
          } catch {
            // try next embed
          }
        }
      }
    } catch {
      // try next source
    }

    if (!stillSameMedia(opts.mediaKey)) return;
    if (haveEnoughAlternates()) return;
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, BETWEEN_SOURCE_YIELD_MS);
    });
  }
}
