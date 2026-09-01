import {
  EmbedOutput,
  NotFoundError,
  SourcererOutput,
} from "@p-stream/providers";
import { useAsyncFn } from "react-use";

import { isExtensionActiveCached } from "@/backend/extension/messaging";
import { prepareStream } from "@/backend/extension/streams";
import {
  scrapeSourceOutputToProviderMetric,
  useReportProviders,
} from "@/backend/helpers/report";
import { getProviders } from "@/backend/providers/providers";
import { convertProviderCaption } from "@/components/player/utils/captions";
import { convertRunoutputToSource } from "@/components/player/utils/convertRunoutputToSource";
import { useOverlayRouter } from "@/hooks/useOverlayRouter";
import { getMediaKey, metaToScrapeMedia } from "@/stores/player/slices/source";
import { usePlayerStore } from "@/stores/player/store";
import { streamsToAudioOptions } from "@/stores/player/utils/audioStreams";
import { discoverAlternateAudioLanguages } from "@/stores/player/utils/discoverAlternateAudio";
import {
  pickBestQualityStream,
  streamsToQualityOptions,
} from "@/stores/player/utils/qualityStreams";
import { usePreferencesStore } from "@/stores/preferences";
import { useProgressStore } from "@/stores/progress";

function getSavedProgress(items: Record<string, any>, meta: any): number {
  const item = items[meta?.tmdbId ?? ""];
  if (!item || !meta) return 0;
  if (meta.type === "movie") {
    if (!item.progress) return 0;
    return item.progress.watched;
  }

  const ep = item.episodes[meta.episode?.tmdbId ?? ""];
  if (!ep) return 0;
  return ep.progress.watched;
}

function startAlternateAudioDiscovery(sourceId: string) {
  const store = usePlayerStore.getState();
  if (!store.meta) return;
  const mediaKey = getMediaKey(store.meta);
  if (!mediaKey) return;
  void discoverAlternateAudioLanguages({
    media: metaToScrapeMedia(store.meta),
    mediaKey,
    skipSourceId: sourceId,
  });
}

function registerCurrentQualityOptions(
  streams: Parameters<typeof streamsToQualityOptions>[0],
  sourceId: string,
  embedId: string | null | undefined,
  preferredLanguage: string | null | undefined,
) {
  const mediaKey = getMediaKey(usePlayerStore.getState().meta);
  if (!mediaKey) return;
  if (streams?.length) {
    usePlayerStore
      .getState()
      .registerSourceMirrors(sourceId, streams, preferredLanguage);
  }
  void streamsToQualityOptions(streams, sourceId, embedId).then((options) => {
    const store = usePlayerStore.getState();
    if (getMediaKey(store.meta) !== mediaKey) return;
    store.registerQualityStreamOptions(options);
  });
}

export function useEmbedScraping(
  routerId: string,
  sourceId: string,
  url: string,
  embedId: string,
) {
  const setSource = usePlayerStore((s) => s.setSource);
  const setCaption = usePlayerStore((s) => s.setCaption);
  const setSourceId = usePlayerStore((s) => s.setSourceId);
  const setEmbedId = usePlayerStore((s) => (s as any).setEmbedId);
  const meta = usePlayerStore((s) => s.meta);
  const progressItems = useProgressStore((s) => s.items);
  const router = useOverlayRouter(routerId);
  const { report } = useReportProviders();
  const preferredAudioLanguage = usePreferencesStore(
    (s) => s.preferredAudioLanguage,
  );

  const [request, run] = useAsyncFn(async () => {
    let result: EmbedOutput | undefined;
    if (!meta) return;
    try {
      result = await getProviders().runEmbedScraper({
        id: embedId,
        url,
      });
    } catch (err) {
      console.error(`Failed to scrape ${embedId}`, err);
      const notFound = err instanceof NotFoundError;
      const status = notFound ? "notfound" : "failed";
      report([
        scrapeSourceOutputToProviderMetric(
          meta,
          sourceId,
          embedId,
          status,
          err,
        ),
      ]);
      throw err;
    }
    report([
      scrapeSourceOutputToProviderMetric(meta, sourceId, null, "success", null),
    ]);
    const embedStreams = Array.isArray(result.stream)
      ? result.stream
      : [result.stream];
    const selectedStream = pickBestQualityStream(
      embedStreams,
      preferredAudioLanguage,
    );
    if (isExtensionActiveCached()) await prepareStream(selectedStream);
    setSourceId(sourceId);
    setEmbedId(embedId);
    setCaption(null);
    usePlayerStore
      .getState()
      .registerAudioStreamOptions(
        streamsToAudioOptions(embedStreams, sourceId, embedId),
      );
    registerCurrentQualityOptions(
      embedStreams,
      sourceId,
      embedId,
      preferredAudioLanguage,
    );
    setSource(
      convertRunoutputToSource({ stream: selectedStream }),
      convertProviderCaption(selectedStream.captions),
      getSavedProgress(progressItems, meta),
    );
    // Save the last successful source only after playback actually starts
    // (see PlayerView hasPlayedOnce effect). Pinning here locks dead streams.
    router.close();
    startAlternateAudioDiscovery(sourceId);
  }, [
    embedId,
    sourceId,
    meta,
    router,
    report,
    setCaption,
    preferredAudioLanguage,
  ]);

  return {
    run,
    loading: request.loading,
    errored: !!request.error,
    notFound: request.error instanceof NotFoundError,
  };
}

const SCRAPE_RETRY_SOURCES = new Set(["way2movies"]);
const SCRAPE_RETRY_DELAY_MS = 2000;

async function runSourceScraperWithRetry(
  sourceId: string,
  media: ReturnType<typeof metaToScrapeMedia>,
) {
  let lastError: unknown;
  const attempts = SCRAPE_RETRY_SOURCES.has(sourceId) ? 2 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await getProviders().runSourceScraper({
        id: sourceId,
        media,
      });
    } catch (err) {
      lastError = err;
      if (attempt + 1 < attempts) {
        await new Promise((resolve) => {
          setTimeout(resolve, SCRAPE_RETRY_DELAY_MS);
        });
      }
    }
  }
  throw lastError;
}

export function useSourceScraping(sourceId: string | null, routerId: string) {
  const meta = usePlayerStore((s) => s.meta);
  const setSource = usePlayerStore((s) => s.setSource);
  const setCaption = usePlayerStore((s) => s.setCaption);
  const setSourceId = usePlayerStore((s) => s.setSourceId);
  const setEmbedId = usePlayerStore((s) => (s as any).setEmbedId);
  const progressItems = useProgressStore((s) => s.items);
  const router = useOverlayRouter(routerId);
  const { report } = useReportProviders();
  const preferredAudioLanguage = usePreferencesStore(
    (s) => s.preferredAudioLanguage,
  );

  const [request, run] = useAsyncFn(async () => {
    if (!sourceId || !meta) return null;
    usePlayerStore.getState().clearFailedSource(sourceId);
    setEmbedId(null);
    const scrapeMedia = metaToScrapeMedia(meta);

    let result: SourcererOutput | undefined;
    try {
      result = await runSourceScraperWithRetry(sourceId, scrapeMedia);
    } catch (err) {
      console.error(`Failed to scrape ${sourceId}`, err);
      const notFound = err instanceof NotFoundError;
      const status = notFound ? "notfound" : "failed";
      report([
        scrapeSourceOutputToProviderMetric(meta, sourceId, null, status, err),
      ]);
      throw err;
    }
    report([
      scrapeSourceOutputToProviderMetric(meta, sourceId, null, "success", null),
    ]);

    if (result.stream) {
      const streams = Array.isArray(result.stream)
        ? result.stream
        : [result.stream];
      const selectedStream = pickBestQualityStream(
        streams,
        preferredAudioLanguage,
      );
      if (isExtensionActiveCached()) await prepareStream(selectedStream);
      setEmbedId(null);
      setCaption(null);
      usePlayerStore
        .getState()
        .registerAudioStreamOptions(
          streamsToAudioOptions(streams, sourceId, null),
        );
      registerCurrentQualityOptions(
        streams,
        sourceId,
        null,
        preferredAudioLanguage,
      );
      setSource(
        convertRunoutputToSource({ stream: selectedStream }),
        convertProviderCaption(selectedStream.captions),
        getSavedProgress(progressItems, meta),
      );
      setSourceId(sourceId);
      // Preferred source pinned after first real play (PlayerView).
      router.close();
      startAlternateAudioDiscovery(sourceId);
      return null;
    }
    if (result.embeds.length === 1) {
      let embedResult: EmbedOutput | undefined;
      if (!meta) return;
      try {
        embedResult = await getProviders().runEmbedScraper({
          id: result.embeds[0].embedId,
          url: result.embeds[0].url,
        });
      } catch (err) {
        console.error(`Failed to scrape ${result.embeds[0].embedId}`, err);
        const notFound = err instanceof NotFoundError;
        const status = notFound ? "notfound" : "failed";
        report([
          scrapeSourceOutputToProviderMetric(
            meta,
            sourceId,
            result.embeds[0].embedId,
            status,
            err,
          ),
        ]);
        throw err;
      }
      report([
        scrapeSourceOutputToProviderMetric(
          meta,
          sourceId,
          result.embeds[0].embedId,
          "success",
          null,
        ),
      ]);
      const embedStreams = Array.isArray(embedResult.stream)
        ? embedResult.stream
        : [embedResult.stream];
      const selectedStream = pickBestQualityStream(
        embedStreams,
        preferredAudioLanguage,
      );
      setSourceId(sourceId);
      setEmbedId(result.embeds[0].embedId);
      setCaption(null);
      if (isExtensionActiveCached()) await prepareStream(selectedStream);
      usePlayerStore
        .getState()
        .registerAudioStreamOptions(
          streamsToAudioOptions(
            embedStreams,
            sourceId,
            result.embeds[0].embedId,
          ),
        );
      registerCurrentQualityOptions(
        embedStreams,
        sourceId,
        result.embeds[0].embedId,
        preferredAudioLanguage,
      );
      setSource(
        convertRunoutputToSource({ stream: selectedStream }),
        convertProviderCaption(selectedStream.captions),
        getSavedProgress(progressItems, meta),
      );
      // Preferred source pinned after first real play (PlayerView).
      router.close();
      startAlternateAudioDiscovery(sourceId);
    }
    return result.embeds;
  }, [sourceId, meta, router, setCaption, preferredAudioLanguage]);

  return {
    run,
    watching: (request.value ?? null) === null,
    loading: request.loading,
    items: request.value,
    notfound: !!(request.error instanceof NotFoundError),
    errored: !!request.error,
  };
}
