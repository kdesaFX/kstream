import { RunOutput } from "@p-stream/providers";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Navigate,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { useAsync } from "react-use";

import { isExtensionActiveCached } from "@/backend/extension/messaging";
import { prepareStream } from "@/backend/extension/streams";
import { DetailedMeta } from "@/backend/metadata/getmeta";
import { usePlayer } from "@/components/player/hooks/usePlayer";
import { usePlayerMeta } from "@/components/player/hooks/usePlayerMeta";
import { UnifiedScrapingLoader } from "@/components/player/internals/UnifiedScrapingLoader";
import { convertProviderCaption } from "@/components/player/utils/captions";
import { convertRunoutputToSource } from "@/components/player/utils/convertRunoutputToSource";
import { useOverlayRouter } from "@/hooks/useOverlayRouter";
import { ScrapingItems, ScrapingSegment } from "@/hooks/useProviderScrape";
import { useQueryParam } from "@/hooks/useQueryParams";
import { useRybbitWatchingEvent } from "@/hooks/useRybbitWatchingEvent";
import { MetaPart } from "@/pages/parts/player/MetaPart";
import { PlaybackErrorPart } from "@/pages/parts/player/PlaybackErrorPart";
import { PlayerPart } from "@/pages/parts/player/PlayerPart";
import { ResumePart } from "@/pages/parts/player/ResumePart";
import { ScrapeErrorPart } from "@/pages/parts/player/ScrapeErrorPart";
import { ScrapingPart } from "@/pages/parts/player/ScrapingPart";
import { SourceSelectPart } from "@/pages/parts/player/SourceSelectPart";
import { createPlaybackRetryBudget, MAX_PLAYBACK_AUTO_RETRIES } from "@/pages/player/playbackRetryBudget";
import { useLastNonPlayerLink } from "@/stores/history";
import {
  PlayerMeta,
  getMediaKey,
  playerStatus,
} from "@/stores/player/slices/source";
import { usePlayerStore } from "@/stores/player/store";
import {
  streamsToAudioOptions,
} from "@/stores/player/utils/audioStreams";
import { discoverAlternateAudioLanguages } from "@/stores/player/utils/discoverAlternateAudio";
import {
  pickBestQualityStream,
  streamsToQualityOptions,
} from "@/stores/player/utils/qualityStreams";
import { usePreferencesStore } from "@/stores/preferences";
import { getProgressPercentage, useProgressStore } from "@/stores/progress";
import { needsOnboarding } from "@/utils/hosting/onboarding";
import { parseTimestamp } from "@/utils/format/timestamp";
import { triggerOfflineDownloadFromPlayerStore } from "@/utils/media/triggerPlayerOfflineDownload";

import { BlurEllipsis } from "./layouts/SubPageLayout";

function startAlternateAudioDiscovery(
  media: Parameters<typeof discoverAlternateAudioLanguages>[0]["media"],
  sourceId: string,
) {
  const mediaKey = getMediaKey(usePlayerStore.getState().meta);
  if (!mediaKey) return;
  void discoverAlternateAudioLanguages({
    media,
    mediaKey,
    skipSourceId: sourceId,
  });
}

function registerCurrentQualityOptions(
  streams: NonNullable<RunOutput["streams"]>,
  sourceId: string,
  embedId: string | null | undefined,
  preferredLanguage: string | null | undefined,
) {
  const mediaKey = getMediaKey(usePlayerStore.getState().meta);
  if (!mediaKey) return;
  usePlayerStore
    .getState()
    .registerSourceMirrors(sourceId, streams, preferredLanguage);
  void streamsToQualityOptions(streams, sourceId, embedId).then((options) => {
    const store = usePlayerStore.getState();
    if (getMediaKey(store.meta) !== mediaKey) return;
    store.registerQualityStreamOptions(options);
  });
}

export function RealPlayerView() {
  const navigate = useNavigate();
  const params = useParams<{
    media: string;
    episode?: string;
    season?: string;
  }>();
  const [errorData, setErrorData] = useState<{
    sources: Record<string, ScrapingSegment>;
    sourceOrder: ScrapingItems[];
  } | null>(null);
  const [resumeFromSourceId, setResumeFromSourceId] = useState<string | null>(
    null,
  );
  const storeResumeFromSourceId = usePlayerStore((s) => s.resumeFromSourceId);
  const setResumeFromSourceIdInStore = usePlayerStore(
    (s) => s.setResumeFromSourceId,
  );
  useRybbitWatchingEvent();
  const [startAtParam] = useQueryParam("t");
  const [offlineDownloadParam, setOfflineDownloadParam] =
    useQueryParam("offlineDownload");
  const [scrapeAttempt, setScrapeAttempt] = useState(0);
  const {
    status,
    playMedia,
    reset,
    setScrapeNotFound,
    shouldStartFromBeginning,
    setShouldStartFromBeginning,
    setStatus,
  } = usePlayer();
  const sourceId = usePlayerStore((s) => s.sourceId);
  const hasPlayedOnce = usePlayerStore((s) => s.mediaPlaying.hasPlayedOnce);
  const isPlaybackLoading = usePlayerStore((s) => s.mediaPlaying.isLoading);
  const storeMeta = usePlayerStore((s) => s.meta);
  const { setPlayerMeta, scrapeMedia } = usePlayerMeta();
  const backUrl = useLastNonPlayerLink();
  const manualSourceSelection = usePreferencesStore(
    (s) => s.manualSourceSelection,
  );
  const rememberSuccessfulSource = usePreferencesStore(
    (s) => s.rememberSuccessfulSource,
  );
  const enableLastSuccessfulSource = usePreferencesStore(
    (s) => s.enableLastSuccessfulSource,
  );
  const preferredAudioLanguage = usePreferencesStore(
    (s) => s.preferredAudioLanguage,
  );
  const router = useOverlayRouter("settings");
  const openedWatchPartyRef = useRef<boolean>(false);
  const offlineDownloadTriggeredRef = useRef(false);
  const playbackRetryBudget = useRef(createPlaybackRetryBudget());
  const wrongRuntimeSkips = usePlayerStore((s) => s.wrongRuntimeSkips);
  const progressItems = useProgressStore((s) => s.items);

  // Reset resume from source ID when leaving the player
  useEffect(() => {
    return () => {
      setResumeFromSourceId(null);
      setResumeFromSourceIdInStore(null);
    };
  }, [setResumeFromSourceIdInStore]);

  const paramsData = JSON.stringify({
    media: params.media,
    season: params.season,
    episode: params.episode,
  });
  useEffect(() => {
    reset();
    setResumeFromSourceId(null);
    setResumeFromSourceIdInStore(null);
    openedWatchPartyRef.current = false;
    offlineDownloadTriggeredRef.current = false;
    playbackRetryBudget.current.setMedia(paramsData);
    setScrapeAttempt(0);
    return () => {
      reset();
    };
  }, [paramsData, reset, setResumeFromSourceIdInStore]);

  // Auto-open watch party menu if URL contains watchparty parameter
  useEffect(() => {
    if (openedWatchPartyRef.current) return;

    if (status === playerStatus.PLAYING) {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has("watchparty")) {
        setTimeout(() => {
          router.navigate("/watchparty");
          openedWatchPartyRef.current = true;
        }, 1000);
      }
    }
  }, [status, router]);

  // Start offline download once playback is ready (from context menu ?offlineDownload=1)
  useEffect(() => {
    if (offlineDownloadTriggeredRef.current) return;
    if (status !== playerStatus.PLAYING) return;
    if (offlineDownloadParam !== "1") return;

    offlineDownloadTriggeredRef.current = true;
    void triggerOfflineDownloadFromPlayerStore()
      .catch((err) => {
        console.error("offline download from context menu failed", err);
      })
      .finally(() => {
        setOfflineDownloadParam(null);
      });
  }, [status, offlineDownloadParam, setOfflineDownloadParam]);

  const metaChange = useCallback(
    (meta: PlayerMeta) => {
      if (meta?.type === "show")
        navigate(
          `/media/${params.media}/${meta.season?.tmdbId}/${meta.episode?.tmdbId}`,
        );
      else navigate(`/media/${params.media}`);
    },
    [navigate, params],
  );

  // Check if episode is more than 80% watched
  const shouldShowResumeScreen = useCallback(
    (meta: PlayerMeta) => {
      if (!meta?.tmdbId) return false;

      const item = progressItems[meta.tmdbId];
      if (!item) return false;

      if (meta.type === "movie") {
        if (!item.progress) return false;
        const percentage = getProgressPercentage(
          item.progress.watched,
          item.progress.duration,
        );
        return percentage > 80;
      }

      if (meta.type === "show" && meta.episode?.tmdbId) {
        const episode = item.episodes?.[meta.episode.tmdbId];
        if (!episode) return false;
        const percentage = getProgressPercentage(
          episode.progress.watched,
          episode.progress.duration,
        );
        return percentage > 80;
      }

      return false;
    },
    [progressItems],
  );

  const handleMetaReceived = useCallback(
    (detailedMeta: DetailedMeta, episodeId?: string) => {
      const playerMeta = setPlayerMeta(detailedMeta, episodeId);
      if (playerMeta && shouldShowResumeScreen(playerMeta)) {
        setStatus(playerStatus.RESUME);
      }
    },
    [shouldShowResumeScreen, setStatus, setPlayerMeta],
  );

  const handleResume = useCallback(() => {
    setStatus(playerStatus.SCRAPING);
  }, [setStatus]);

  const handleRestart = useCallback(() => {
    setShouldStartFromBeginning(true);
    setStatus(playerStatus.SCRAPING);
  }, [setShouldStartFromBeginning, setStatus]);

  const handleResumeScraping = useCallback(
    (startFromSourceId: string) => {
      playbackRetryBudget.current.recordAttempt();
      setScrapeAttempt((n) => n + 1);
      setResumeFromSourceId(startFromSourceId);
      setResumeFromSourceIdInStore(startFromSourceId);
      usePlayerStore.setState((s) => {
        s.status = playerStatus.SCRAPING;
        s.interface.error = undefined;
        s.sourceId = null;
        s.embedId = null;
        s.mediaPlaying.hasPlayedOnce = false;
      });
    },
    [setResumeFromSourceIdInStore],
  );

  /** Retry scrape without skipping the current source (next TQQ mirror, etc.). */
  const handleRetrySource = useCallback(() => {
    playbackRetryBudget.current.recordAttempt();
    setScrapeAttempt((n) => n + 1);
    setResumeFromSourceId(null);
    setResumeFromSourceIdInStore(null);
    usePlayerStore.setState((s) => {
      s.status = playerStatus.SCRAPING;
      s.interface.error = undefined;
      s.sourceId = null;
      s.embedId = null;
      s.mediaPlaying.hasPlayedOnce = false;
    });
  }, [setResumeFromSourceIdInStore]);

  const prevWrongRuntimeSkips = useRef(0);
  useEffect(() => {
    if (wrongRuntimeSkips > prevWrongRuntimeSkips.current) {
      setScrapeAttempt((n) => n + 1);
    }
    prevWrongRuntimeSkips.current = wrongRuntimeSkips;
  }, [wrongRuntimeSkips]);

  // Sync store value to local state when it changes (e.g., from settings)
  // or when status changes to SCRAPING
  useEffect(() => {
    if (storeResumeFromSourceId && status === playerStatus.SCRAPING) {
      if (
        !resumeFromSourceId ||
        resumeFromSourceId !== storeResumeFromSourceId
      ) {
        setResumeFromSourceId(storeResumeFromSourceId);
      }
    }
  }, [storeResumeFromSourceId, resumeFromSourceId, status]);

  const playAfterScrape = useCallback(
    async (out: RunOutput | null) => {
      // Clear resume state after this scrape attempt finishes
      setResumeFromSourceId(null);
      setResumeFromSourceIdInStore(null);

      if (!out) {
        // Only show the "not found" screen when scraping actually found nothing.
        // Calling this before play used to flash the error UI on every success.
        setScrapeNotFound();
        return;
      }

      let startAt: number | undefined;
      if (startAtParam) startAt = parseTimestamp(startAtParam) ?? undefined;

      const availableStreams = out.streams?.length ? out.streams : [out.stream];
      const selectedStream = pickBestQualityStream(
        availableStreams,
        preferredAudioLanguage,
        out.stream,
      );

      if (isExtensionActiveCached()) {
        await prepareStream(selectedStream);
      }

      usePlayerStore
        .getState()
        .registerAudioStreamOptions(
          streamsToAudioOptions(availableStreams, out.sourceId, out.embedId),
        );
      registerCurrentQualityOptions(
        availableStreams,
        out.sourceId,
        out.embedId,
        preferredAudioLanguage,
      );

      playMedia(
        convertRunoutputToSource({ stream: selectedStream }),
        convertProviderCaption(selectedStream.captions),
        out.sourceId,
        shouldStartFromBeginning ? 0 : startAt,
      );
      if (out.embedId) {
        usePlayerStore.getState().setEmbedId(out.embedId);
      }
      // Do not pin preferred/last-successful here — scrape ≠ playback. Pinning
      // before the first frame locks titles onto dead streams and forces the
      // "trying the next source" loop on every episode.
      setShouldStartFromBeginning(false);

      if (scrapeMedia) {
        startAlternateAudioDiscovery(scrapeMedia, out.sourceId);
      }
    },
    [
      playMedia,
      startAtParam,
      shouldStartFromBeginning,
      setShouldStartFromBeginning,
      preferredAudioLanguage,
      scrapeMedia,
      setScrapeNotFound,
      setResumeFromSourceIdInStore,
    ],
  );

  // Pin preferred / last-successful only after a few seconds of real progress —
  // not on scrape success, and not on the HTML `play` event (autoplay can fire
  // that before any frames buffer, which used to lock titles onto dead streams).
  const watchedSeconds = usePlayerStore((s) => s.progress.time);
  const metaTmdbId = storeMeta?.tmdbId;
  const preparingPlayback =
    status === playerStatus.PLAYING && !hasPlayedOnce && isPlaybackLoading;
  const preparingTitle =
    storeMeta?.type === "show" && storeMeta.episode
      ? `${storeMeta.title} · S${storeMeta.season?.number ?? 1}E${storeMeta.episode.number}`
      : storeMeta?.title;
  useEffect(() => {
    if (!enableLastSuccessfulSource || !sourceId || watchedSeconds < 5) return;
    rememberSuccessfulSource(metaTmdbId, sourceId);
  }, [
    enableLastSuccessfulSource,
    watchedSeconds,
    sourceId,
    metaTmdbId,
    rememberSuccessfulSource,
  ]);

  return (
    <PlayerPart backUrl={backUrl} onMetaChange={metaChange}>
      {status !== playerStatus.PLAYING ? <BlurEllipsis neutral /> : null}
      {status === playerStatus.IDLE ? (
        <MetaPart onGetMeta={handleMetaReceived} />
      ) : null}
      {status === playerStatus.RESUME ? (
        <ResumePart
          onResume={handleResume}
          onRestart={handleRestart}
          onMetaChange={metaChange}
        />
      ) : null}
      {status === playerStatus.SCRAPING && scrapeMedia ? (
        manualSourceSelection ? (
          <SourceSelectPart media={scrapeMedia} />
        ) : (
          <ScrapingPart
            key={`scraping-${scrapeAttempt}-${paramsData}`}
            media={scrapeMedia}
            startFromSourceId={
              resumeFromSourceId || storeResumeFromSourceId || undefined
            }
            onResult={(sources, sourceOrder) => {
              // Keep scrape details for the real not-found screen; do not flip
              // status here or a successful play flashes the error UI first.
              setErrorData({
                sourceOrder,
                sources,
              });
            }}
            onGetStream={playAfterScrape}
          />
        )
      ) : null}
      {status === playerStatus.SCRAPE_NOT_FOUND && errorData ? (
        <ScrapeErrorPart
          data={errorData}
          onRetry={() => {
            setScrapeAttempt((n) => n + 1);
            usePlayerStore.setState((s) => {
              s.sourceId = null;
              s.embedId = null;
              s.interface.error = undefined;
            });
            setStatus(playerStatus.SCRAPING);
          }}
        />
      ) : null}
      {status === playerStatus.PLAYBACK_ERROR ? (
        <PlaybackErrorPart
          onResume={handleResumeScraping}
          onRetrySource={handleRetrySource}
          currentSourceId={sourceId}
          autoResumeExhausted={playbackRetryBudget.current.isExhausted(
            MAX_PLAYBACK_AUTO_RETRIES,
          )}
        />
      ) : null}
      {preparingPlayback ? (
        <UnifiedScrapingLoader
          poster={storeMeta?.poster}
          title={preparingTitle}
          sourceOrder={[]}
          sources={{}}
          className="z-20"
        />
      ) : null}
    </PlayerPart>
  );
}

export function PlayerView() {
  const loc = useLocation();
  const { loading, error, value } = useAsync(() => {
    return needsOnboarding();
  });

  if (error) throw new Error("Failed to detect onboarding");
  if (loading) return null;
  if (value)
    return (
      <Navigate
        replace
        to={{
          pathname: "/onboarding",
          search: `redirect=${encodeURIComponent(loc.pathname)}`,
        }}
      />
    );
  return <RealPlayerView />;
}

export default PlayerView;
