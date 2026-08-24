/* eslint-disable no-console */
import { ScrapeMedia } from "@p-stream/providers";

import { downloadCaption } from "@/backend/helpers/subs";
import { TTMLCue } from "@/components/player/utils/ttml";
import { MakeSlice } from "@/stores/player/slices/types";
import {
  AudioStreamOption,
  mergeAudioStreamOptions,
} from "@/stores/player/utils/audioStreams";
import {
  mergeUniqueCaptions,
  shouldStartExternalSubtitleScrape,
} from "@/stores/player/utils/externalSubtitleCache";
import {
  SourceQuality,
  SourceSliceSource,
  selectQuality,
} from "@/stores/player/utils/qualities";
import { mergeQualityStreamOptions } from "@/stores/player/utils/qualityStreams";
import type { QualityStreamOption } from "@/stores/player/utils/qualityStreams";
import { isUrlAlreadyProxied } from "@/components/player/utils/proxy";
import { useQualityStore } from "@/stores/quality";
import { usePreferencesStore } from "@/stores/preferences";
import { runtimeVerdict } from "@/utils/media/runtimeMismatch";
import googletranslate from "@/utils/translation/googletranslate";
import { translate } from "@/utils/translation/index";
import { ValuesOf } from "@/utils/common/typeguard";

export const playerStatus = {
  IDLE: "idle",
  RESUME: "resume",
  SCRAPING: "scraping",
  PLAYING: "playing",
  SCRAPE_NOT_FOUND: "scrapeNotFound",
  PLAYBACK_ERROR: "playbackError",
} as const;

export type PlayerStatus = ValuesOf<typeof playerStatus>;

/**
 * How long a cross-source quality hop stays undoable. It has to outlast the
 * player's 30s "stream never started" watchdog, since that timeout is the usual
 * way a bad hop reports itself.
 */
const QUALITY_HOP_PROBATION_MS = 45_000;

/**
 * How many sources may be dropped for serving a video of the wrong length
 * before we stop second-guessing them. Past this the runtime we're comparing
 * against is the likelier suspect (TMDB has no runtime for plenty of specials),
 * so playing something beats refusing everything.
 */
const MAX_WRONG_RUNTIME_SKIPS = 3;

/** How long a suspiciously short video gets to grow before we believe it. */
const SHORT_RUNTIME_SETTLE_MS = 4000;

/** The short-looking duration we are waiting on, if any. */
let shortRuntimeProbe: { sourceId: string; durationSeconds: number } | null =
  null;

/**
 * Confirm a "too short" duration by looking at it twice. Streams that are still
 * loading report a duration that keeps growing, so the first sighting only
 * schedules another look; a duration that hasn't grown by then is the real one.
 */
function confirmShortRuntime(
  sourceId: string,
  durationSeconds: number,
  recheck: () => void,
): boolean {
  const probe = shortRuntimeProbe;
  if (
    probe &&
    probe.sourceId === sourceId &&
    durationSeconds <= probe.durationSeconds + 1
  ) {
    shortRuntimeProbe = null;
    return true;
  }

  shortRuntimeProbe = { sourceId, durationSeconds };
  setTimeout(recheck, SHORT_RUNTIME_SETTLE_MS);
  return false;
}

export interface PlayerMetaEpisode {
  number: number;
  tmdbId: string;
  title: string;
  air_date?: string;
  overview?: string;
  /** Minutes, when TMDB has it. */
  runtime?: number | null;
}

export interface PlayerMeta {
  type: "movie" | "show";
  title: string;
  originalTitle?: string;
  tmdbId: string;
  imdbId?: string;
  releaseYear: number;
  /** ISO date YYYY-MM-DD when known. */
  releaseDate?: string;
  poster?: string;
  overview?: string;
  /** TMDB genre ids — used for anime source routing. */
  genreIds?: number[];
  originalLanguage?: string;
  originCountry?: string[];
  /** Movie length in minutes; used to spot a source serving another title. */
  runtime?: number | null;
  /** Typical episode length in minutes, for shows. */
  episodeRuntime?: number | null;
  episodes?: PlayerMetaEpisode[];
  episode?: PlayerMetaEpisode;
  season?: {
    number: number;
    tmdbId: string;
    title: string;
  };
}

export interface Caption {
  id: string;
  language: string;
  url?: string;
  srtData: string;
  ttmlCues?: TTMLCue[];
}

export interface CaptionListItem {
  id: string;
  language: string;
  url: string;
  type?: string;
  needsProxy: boolean;
  hls?: boolean;
  opensubtitles?: boolean;
  /** Headers required to fetch the caption (e.g. Referer for AniKoto CDN). */
  headers?: Record<string, string>;
  // subtitle details from wyzie
  display?: string;
  media?: string;
  isHearingImpaired?: boolean;
  source?: string;
  encoding?: string;
  flagUrl?: string;
  release?: string | null;
  releases?: string[];
  origin?: string | null;
}

export interface AudioTrack {
  id: string;
  label: string;
  language: string;
}

export interface TranslateTask {
  targetCaption: CaptionListItem;
  fetchedTargetCaption?: Caption;
  targetLanguage: string;
  translatedCaption?: Caption;
  done: boolean;
  error: boolean;
  cancel: () => void;
}

/**
 * The stream that was playing before a cross-source quality hop, kept just long
 * enough to put it back if the new one doesn't start.
 */
export interface QualityHopFallback {
  source: SourceSliceSource;
  captions: CaptionListItem[];
  sourceId: string | null;
  embedId: string | null;
  quality: SourceQuality | null;
  automaticQuality: boolean;
  startAt: number;
  expiresAt: number;
}

export interface SourceSlice {
  status: PlayerStatus;
  source: SourceSliceSource | null;
  sourceId: string | null;
  embedId: string | null;
  /** Set while a quality hop is on probation; see restoreQualityHopFallback. */
  qualityHopFallback: QualityHopFallback | null;
  qualities: SourceQuality[];
  audioTracks: AudioTrack[];
  /** Cross-source / multi-stream audio languages available for this title. */
  audioStreamOptions: AudioStreamOption[];
  /** Quality tiers found on the current and alternate sources. */
  qualityStreamOptions: QualityStreamOption[];
  currentQuality: SourceQuality | null;
  currentAudioTrack: AudioTrack | null;
  /** Currently selected cross-stream audio option id, if any. */
  currentAudioStreamId: string | null;
  captionList: CaptionListItem[];
  isLoadingExternalSubtitles: boolean;
  /** Media key already scraped (or currently scraping) for external captions. */
  externalSubtitlesMediaKey: string | null;
  /** Cached external captions reused when playback switches streams. */
  externalCaptionList: CaptionListItem[];
  caption: {
    selected: Caption | null;
    asTrack: boolean;
    translateTask: TranslateTask | null;
  };
  meta: PlayerMeta | null;
  failedSourcesPerMedia: Record<string, string[]>; // mediaKey -> array of failed sourceIds
  failedEmbedsPerMedia: Record<string, Record<string, string[]>>; // mediaKey -> sourceId -> array of failed embedIds
  resumeFromSourceId: string | null;
  /** Sources dropped for playing the wrong-length video, for the current media. */
  wrongRuntimeSkips: number;
  setStatus(status: PlayerStatus): void;
  setSource(
    stream: SourceSliceSource,
    captions: CaptionListItem[],
    startAt: number,
  ): void;
  switchQuality(quality: SourceQuality): void;
  setMeta(meta: PlayerMeta, status?: PlayerStatus): void;
  setCaption(caption: Caption | null): void;
  setSourceId(id: string | null): void;
  setEmbedId(id: string | null): void;
  enableAutomaticQuality(): void;
  redisplaySource(startAt: number): void;
  setCaptionAsTrack(asTrack: boolean): void;
  addExternalSubtitles(): Promise<void>;
  updateCaptionLanguage(captionId: string, language: string): void;
  reclassifyMislabeledEnglishCaptions(): Promise<void>;
  translateCaption(
    targetCaption: CaptionListItem,
    targetLanguage: string,
  ): Promise<void>;
  clearTranslateTask(): void;
  addFailedSource(sourceId: string): void;
  addFailedEmbed(sourceId: string, embedId: string): void;
  clearFailedSources(mediaKey?: string): void;
  clearFailedEmbeds(mediaKey?: string): void;
  setResumeFromSourceId(sourceId: string | null): void;
  /**
   * Called with the duration the player worked out for the loaded stream. Drops
   * the source and goes looking for another when that duration says the video
   * cannot be the requested title.
   */
  reportStreamDuration(durationSeconds: number): void;
  registerAudioStreamOptions(options: AudioStreamOption[]): void;
  clearAudioStreamOptions(): void;
  switchAudioStream(optionId: string): void;
  registerQualityStreamOptions(options: QualityStreamOption[]): void;
  clearQualityStreamOptions(): void;
  switchQualityStream(quality: SourceQuality): void;
  /** Put back the pre-hop stream. Returns false when there's nothing to undo. */
  restoreQualityHopFallback(): boolean;
  /** Switch HLS in-manifest audio; clears cross-source stream selection. */
  selectHlsAudioTrack(track: AudioTrack): void;
  reset(): void;
}

/**
 * Generates a unique media key for tracking failed sources per media.
 * For movies: `${type}-${tmdbId}`
 * For shows: `${type}-${tmdbId}-${season.tmdbId}-${episode.tmdbId}`
 */
export function getMediaKey(meta: PlayerMeta | null): string | null {
  if (!meta) return null;

  if (meta.type === "movie") {
    return `${meta.type}-${meta.tmdbId}`;
  }

  // For shows, include season and episode IDs for per-episode tracking
  if (meta.type === "show" && meta.season && meta.episode) {
    return `${meta.type}-${meta.tmdbId}-${meta.season.tmdbId}-${meta.episode.tmdbId}`;
  }

  // Fallback if show data is incomplete
  return `${meta.type}-${meta.tmdbId}`;
}

/**
 * Title used for provider search.
 * Prefer the localized/English TMDB name when the original is a different
 * script (e.g. anime ホリミヤ vs "Horimiya") — English scrapers otherwise
 * miss the match or latch onto spinoffs.
 */
export function pickScrapeTitle(meta: {
  title: string;
  originalTitle?: string;
}): string {
  const display = meta.title?.trim() || "";
  const original = meta.originalTitle?.trim() || "";
  if (!original) return display;
  if (!display) return original;

  const hasLatin = (s: string) => /[a-z]/i.test(s);
  if (hasLatin(display) && !hasLatin(original)) return display;

  return original || display;
}

export function metaToScrapeMedia(meta: PlayerMeta): ScrapeMedia {
  if (meta.type === "show") {
    if (!meta.episode || !meta.season) throw new Error("missing show data");
    return {
      title: pickScrapeTitle(meta),
      releaseYear: meta.releaseYear,
      tmdbId: meta.tmdbId,
      type: "show",
      imdbId: meta.imdbId,
      episode: meta.episode,
      season: meta.season,
    };
  }

  return {
    title: pickScrapeTitle(meta),
    releaseYear: meta.releaseYear,
    tmdbId: meta.tmdbId,
    type: "movie",
    imdbId: meta.imdbId,
  };
}

export const createSourceSlice: MakeSlice<SourceSlice> = (set, get) => ({
  source: null,
  sourceId: null,
  embedId: null,
  qualities: [],
  audioTracks: [],
  audioStreamOptions: [],
  qualityStreamOptions: [],
  captionList: [],
  isLoadingExternalSubtitles: false,
  externalSubtitlesMediaKey: null,
  externalCaptionList: [],
  currentQuality: null,
  currentAudioTrack: null,
  currentAudioStreamId: null,
  status: playerStatus.IDLE,
  meta: null,
  failedSourcesPerMedia: {},
  failedEmbedsPerMedia: {},
  resumeFromSourceId: null,
  wrongRuntimeSkips: 0,
  qualityHopFallback: null,
  caption: {
    selected: null,
    asTrack: false,
    translateTask: null,
  },
  setSourceId(id) {
    set((s) => {
      s.status = playerStatus.PLAYING;
      s.sourceId = id;
      s.embedId = null;
    });
  },
  setEmbedId(id) {
    set((s) => {
      s.embedId = id;
    });
  },
  setStatus(status: PlayerStatus) {
    set((s) => {
      s.status = status;
    });
  },
  setMeta(meta, newStatus) {
    const store = get();
    const oldMediaKey = getMediaKey(store.meta);
    const newMediaKey = getMediaKey(meta);

    set((s) => {
      s.meta = meta;
      s.embedId = null;
      s.sourceId = null;
      s.interface.hideNextEpisodeBtn = false;
      if (newStatus) s.status = newStatus;

      // Fresh audio options whenever the watched media/episode changes
      if (!oldMediaKey || (newMediaKey && oldMediaKey !== newMediaKey)) {
        s.audioStreamOptions = [];
        s.qualityStreamOptions = [];
        s.currentAudioStreamId = null;
        s.externalSubtitlesMediaKey = null;
        s.externalCaptionList = [];
        s.isLoadingExternalSubtitles = false;
        // Don't carry "start after source X" into the next episode — that
        // short-circuits anime mirrors (TQQ) and jumps to later sources.
        s.resumeFromSourceId = null;
        s.wrongRuntimeSkips = 0;
      }

      if (newMediaKey && oldMediaKey && oldMediaKey !== newMediaKey) {
        // Clear failed sources/embeds for the new media (if any exist from previous session)
        // This ensures a fresh start for each media/episode
        delete s.failedSourcesPerMedia[newMediaKey];
        delete s.failedEmbedsPerMedia[newMediaKey];
      }
    });
  },
  setCaption(caption) {
    const store = get();
    store.display?.setCaption(caption);
    if (
      !caption ||
      (store.caption.translateTask &&
        store.caption.translateTask.targetCaption.id !== caption?.id &&
        store.caption.translateTask.translatedCaption?.id !== caption?.id)
    ) {
      store.clearTranslateTask();
    }
    set((s) => {
      s.caption.selected = caption;
    });
  },
  updateCaptionLanguage(captionId, language) {
    set((s) => {
      const item = s.captionList.find((c) => c.id === captionId);
      if (!item || item.language === language) return;
      item.language = language;
      if (item.display && /english/i.test(item.display)) {
        item.display = language;
      }
      if (s.caption.selected?.id === captionId) {
        s.caption.selected.language = language;
      }
    });
  },
  async reclassifyMislabeledEnglishCaptions() {
    const { sniffCaptionLanguage } = await import("@/backend/helpers/subs");
    const englishish = get()
      .captionList.filter((c) => {
        if (c.hls) return false;
        const lang = (c.language || "").toLowerCase().split("-")[0];
        return lang === "en" || lang === "eng";
      })
      .slice(0, 24);

    const concurrency = 4;
    for (let i = 0; i < englishish.length; i += concurrency) {
      const batch = englishish.slice(i, i + concurrency);
      await Promise.all(
        batch.map(async (caption) => {
          const language = await sniffCaptionLanguage(caption);
          if (language !== caption.language) {
            get().updateCaptionLanguage(caption.id, language);
          }
        }),
      );
    }
  },
  setSource(
    stream: SourceSliceSource,
    captions: CaptionListItem[],
    startAt: number,
  ) {
    shortRuntimeProbe = null;
    let qualities: string[] = [];
    if (stream.type === "file") qualities = Object.keys(stream.qualities);
    const qualityPreferences = useQualityStore.getState();
    const loadableStream = selectQuality(stream, qualityPreferences.quality);

    set((s) => {
      const mediaKey = getMediaKey(s.meta);
      const cachedExternalCaptions =
        mediaKey && s.externalSubtitlesMediaKey === mediaKey
          ? s.externalCaptionList
          : [];

      s.source = stream;
      s.qualities = qualities as SourceQuality[];
      s.currentQuality = loadableStream.quality;
      s.captionList = mergeUniqueCaptions(captions, cachedExternalCaptions);
      s.interface.error = undefined;
      s.status = playerStatus.PLAYING;
      // Avoid one-frame idle player (play button + 00:00 controls) before
      // display.load() emits loading.
      s.mediaPlaying.isLoading = true;
      s.mediaPlaying.isPlaying = false;
      s.mediaPlaying.isPaused = true;
      s.audioTracks = [];
      s.currentAudioTrack = null;
      if (stream.audioLanguage) {
        const match = s.audioStreamOptions.find(
          (o) => o.language === stream.audioLanguage,
        );
        s.currentAudioStreamId = match?.id ?? null;
      }
    });
    const store = get();
    store.redisplaySource(startAt);

    // Correct mislabeled English source captions in the background
    setTimeout(() => {
      void store.reclassifyMislabeledEnglishCaptions();
    }, 250);

    // Trigger external subtitle scraping after stream is loaded
    // This runs asynchronously so it doesn't block the stream loading
    setTimeout(() => {
      store.addExternalSubtitles();
    }, 100);
  },
  redisplaySource(startAt: number) {
    const store = get();
    if (!store.source) return;
    const qualityPreferences = useQualityStore.getState();
    const loadableStream = selectQuality(store.source, {
      automaticQuality: qualityPreferences.quality.automaticQuality,
      lastChosenQuality: qualityPreferences.quality.lastChosenQuality,
    });
    set((s) => {
      s.interface.error = undefined;
      s.status = playerStatus.PLAYING;
      s.mediaPlaying.isLoading = true;
    });
    store.display?.load({
      source: loadableStream.stream,
      startAt,
      automaticQuality: qualityPreferences.quality.automaticQuality,
      preferredQuality: qualityPreferences.quality.lastChosenQuality,
    });
  },
  switchQuality(quality) {
    const store = get();
    if (!store.source) return;
    if (store.source.type === "file") {
      const selectedQuality = store.source.qualities[quality];
      if (!selectedQuality) return;
      set((s) => {
        s.currentQuality = quality;
        s.status = playerStatus.PLAYING;
        s.interface.error = undefined;
        s.mediaPlaying.isLoading = true;
      });
      store.display?.load({
        source: selectedQuality,
        startAt: store.progress.time,
        automaticQuality: false,
        preferredQuality: quality,
      });
    } else if (store.source.type === "hls") {
      store.display?.changeQuality(false, quality);
    }
  },
  enableAutomaticQuality() {
    const store = get();
    store.display?.changeQuality(true, null);
  },
  setCaptionAsTrack(asTrack: boolean) {
    set((s) => {
      s.caption.asTrack = asTrack;
    });
  },
  addFailedSource(sourceId: string) {
    const store = get();
    const mediaKey = getMediaKey(store.meta);
    if (!mediaKey) return; // Skip tracking if no media is set

    set((s) => {
      if (!s.failedSourcesPerMedia[mediaKey]) {
        s.failedSourcesPerMedia[mediaKey] = [];
      }
      if (!s.failedSourcesPerMedia[mediaKey].includes(sourceId)) {
        s.failedSourcesPerMedia[mediaKey] = [
          ...s.failedSourcesPerMedia[mediaKey],
          sourceId,
        ];
      }
      // Drop alternate quality rows for the dead provider so the menu cannot
      // keep advertising e.g. "1080 · Nova" after Nova already failed.
      s.qualityStreamOptions = s.qualityStreamOptions.filter(
        (option) => option.sourceId !== sourceId,
      );
    });
  },
  addFailedEmbed(sourceId: string, embedId: string) {
    const store = get();
    const mediaKey = getMediaKey(store.meta);
    if (!mediaKey) return; // Skip tracking if no media is set

    set((s) => {
      if (!s.failedEmbedsPerMedia[mediaKey]) {
        s.failedEmbedsPerMedia[mediaKey] = {};
      }
      if (!s.failedEmbedsPerMedia[mediaKey][sourceId]) {
        s.failedEmbedsPerMedia[mediaKey][sourceId] = [];
      }
      if (!s.failedEmbedsPerMedia[mediaKey][sourceId].includes(embedId)) {
        s.failedEmbedsPerMedia[mediaKey][sourceId] = [
          ...s.failedEmbedsPerMedia[mediaKey][sourceId],
          embedId,
        ];
      }
    });
  },
  clearFailedSources(mediaKey?: string) {
    set((s) => {
      if (mediaKey) {
        // Clear for specific media
        delete s.failedSourcesPerMedia[mediaKey];
      } else {
        // Clear all
        s.failedSourcesPerMedia = {};
      }
    });
  },
  clearFailedEmbeds(mediaKey?: string) {
    set((s) => {
      if (mediaKey) {
        // Clear for specific media
        delete s.failedEmbedsPerMedia[mediaKey];
      } else {
        // Clear all
        s.failedEmbedsPerMedia = {};
      }
    });
  },
  setResumeFromSourceId(sourceId: string | null) {
    set((s) => {
      s.resumeFromSourceId = sourceId;
    });
  },
  reportStreamDuration(durationSeconds) {
    const store = get();
    if (store.status !== playerStatus.PLAYING) return;
    if (!store.meta || !store.sourceId) return;
    if (store.wrongRuntimeSkips >= MAX_WRONG_RUNTIME_SKIPS) return;

    const verdict = runtimeVerdict(store.meta, durationSeconds);
    if (verdict === "ok") {
      shortRuntimeProbe = null;
      return;
    }
    // A playlist still being written reports a duration that grows, and a
    // half-loaded one looks like a short video. Only a video that is already
    // too long to be this title can be judged on first sight.
    if (
      verdict === "tooShort" &&
      !confirmShortRuntime(store.sourceId, durationSeconds, () =>
        get().reportStreamDuration(get().progress.duration),
      )
    ) {
      return;
    }

    // A quality hop that lands on another title is undone like any bad hop:
    // hand the user back the stream they were already watching.
    if (store.restoreQualityHopFallback()) return;

    const sourceId = store.sourceId;
    const embedId = store.embedId;
    console.warn(
      `[${sourceId}] served a ${Math.round(durationSeconds / 60)}min video for "${
        store.meta.title
      }" — skipping it`,
    );

    if (embedId) store.addFailedEmbed(sourceId, embedId);
    else store.addFailedSource(sourceId);

    // Loading it counted as a success, so drop those pins or the next attempt
    // walks straight back into the same wrong video.
    const preferences = usePreferencesStore.getState();
    if (store.meta.tmdbId) {
      preferences.clearPreferredSourceForTitle(store.meta.tmdbId);
    }
    if (preferences.lastSuccessfulSource === sourceId) {
      preferences.setLastSuccessfulSource(null);
    }

    store.display?.load({
      source: null,
      startAt: 0,
      automaticQuality: false,
      preferredQuality: null,
    });

    set((s) => {
      s.wrongRuntimeSkips += 1;
      s.source = null;
      s.progress.time = 0;
      s.progress.duration = 0;
      // A bad mirror only rules out that mirror, so let the same source offer
      // its next one; a bad source is skipped entirely.
      s.resumeFromSourceId = embedId ? null : sourceId;
      s.status = playerStatus.SCRAPING;
    });
  },
  registerAudioStreamOptions(options) {
    if (!options.length) return;
    set((s) => {
      s.audioStreamOptions = mergeAudioStreamOptions(
        s.audioStreamOptions,
        options,
      );
      if (!s.currentAudioStreamId) {
        const lang = s.source?.audioLanguage?.trim();
        const match = lang
          ? s.audioStreamOptions.find((o) => o.language === lang)
          : undefined;
        s.currentAudioStreamId =
          match?.id ?? s.audioStreamOptions[0]?.id ?? null;
      }
    });
  },
  clearAudioStreamOptions() {
    set((s) => {
      s.audioStreamOptions = [];
      s.currentAudioStreamId = null;
    });
  },
  switchAudioStream(optionId) {
    const store = get();
    const option = store.audioStreamOptions.find((o) => o.id === optionId);
    if (!option) return;
    if (option.id === store.currentAudioStreamId) return;

    const startAt = store.progress.time;
    set((s) => {
      s.currentAudioStreamId = option.id;
      s.sourceId = option.sourceId;
      s.embedId = option.embedId ?? null;
    });
    usePreferencesStore.getState().setPreferredAudioLanguage(option.language);
    store.setSource(option.source, option.captions, startAt);
  },
  registerQualityStreamOptions(options) {
    if (!options.length) return;
    set((s) => {
      s.qualityStreamOptions = mergeQualityStreamOptions(
        s.qualityStreamOptions,
        options,
      );
    });
  },
  clearQualityStreamOptions() {
    set((s) => {
      s.qualityStreamOptions = [];
    });
  },
  switchQualityStream(quality) {
    const store = get();
    const option = store.qualityStreamOptions.find(
      (candidate) => candidate.quality === quality,
    );
    if (!option) return;

    const startAt = store.progress.time;
    const previousAutomatic =
      useQualityStore.getState().quality.automaticQuality;
    // Proxied HLS (Nova-edge via /api/m3u8-proxy) cannot hard-lock 1080 on the
    // first fragment — init segments are multi-MB and die. Soft-target the tier
    // with Auto + climb; extension / direct URLs keep the hard lock.
    const softHop =
      option.source.type === "hls" && isUrlAlreadyProxied(option.source.url);
    useQualityStore.getState().setAutomaticQuality(softHop);
    useQualityStore.getState().setLastChosenQuality(quality);

    // Asking for a different tier is not the same as the current stream dying,
    // so keep the working one on hand. If the tier we hop to never starts, we
    // put this back instead of treating it as a dead source and restarting the
    // whole scrape, which loses the user's place and their working stream.
    const fallback: QualityHopFallback | null = store.source
      ? {
          source: store.source,
          captions: store.captionList,
          sourceId: store.sourceId,
          embedId: store.embedId,
          quality: store.currentQuality,
          automaticQuality: previousAutomatic,
          startAt,
          expiresAt: Date.now() + QUALITY_HOP_PROBATION_MS,
        }
      : null;

    set((s) => {
      s.sourceId = option.sourceId;
      s.embedId = option.embedId ?? null;
      s.currentAudioStreamId = null;
      s.qualityHopFallback = fallback;
      s.mediaPlaying.hasPlayedOnce = false;
    });
    store.setSource(option.source, option.captions, startAt);
  },
  restoreQualityHopFallback() {
    const fallback = get().qualityHopFallback;
    if (!fallback) return false;

    set((s) => {
      s.qualityHopFallback = null;
    });
    if (Date.now() > fallback.expiresAt) return false;

    // The tier the user asked for can't be served, so stop pinning it —
    // otherwise the restored stream gets asked for the same missing rung.
    useQualityStore.getState().setAutomaticQuality(fallback.automaticQuality);
    useQualityStore.getState().setLastChosenQuality(fallback.quality);
    set((s) => {
      s.sourceId = fallback.sourceId;
      s.embedId = fallback.embedId;
      s.currentAudioStreamId = null;
    });
    get().setSource(fallback.source, fallback.captions, fallback.startAt);
    return true;
  },
  selectHlsAudioTrack(track) {
    const store = get();
    // Cross-source option is no longer the active choice — otherwise the menu
    // keeps a stale checkmark (e.g. Korean) while HLS English is playing.
    set((s) => {
      s.currentAudioStreamId = null;
      s.currentAudioTrack = track;
    });
    if (track.language) {
      usePreferencesStore.getState().setPreferredAudioLanguage(track.language);
    }
    store.display?.changeAudioTrack(track);
  },
  reset() {
    get().clearSkipSegments?.();
    set((s) => {
      s.source = null;
      s.sourceId = null;
      s.embedId = null;
      s.qualities = [];
      s.audioTracks = [];
      s.audioStreamOptions = [];
      s.qualityStreamOptions = [];
      s.captionList = [];
      s.isLoadingExternalSubtitles = false;
      s.externalSubtitlesMediaKey = null;
      s.externalCaptionList = [];
      s.currentQuality = null;
      s.currentAudioTrack = null;
      s.currentAudioStreamId = null;
      s.status = playerStatus.IDLE;
      s.meta = null;
      s.failedSourcesPerMedia = {};
      s.failedEmbedsPerMedia = {};
      s.resumeFromSourceId = null;
      s.wrongRuntimeSkips = 0;
      s.qualityHopFallback = null;
      this.clearTranslateTask();
      s.caption = {
        selected: null,
        asTrack: false,
        translateTask: null,
      };
    });
  },
  async addExternalSubtitles() {
    const store = get();
    if (!store.meta) return;
    const mediaKey = getMediaKey(store.meta);
    if (
      !shouldStartExternalSubtitleScrape(
        mediaKey,
        store.externalSubtitlesMediaKey,
      )
    ) {
      return;
    }
    const meta = store.meta;

    set((s) => {
      // Mark before starting so stream retries cannot launch overlapping
      // subtitle fan-outs for the same title.
      s.externalSubtitlesMediaKey = mediaKey;
      s.isLoadingExternalSubtitles = true;
    });

    try {
      const { scrapeExternalSubtitles } = await import(
        "@/utils/externalSubtitles"
      );
      const externalCaptions = await scrapeExternalSubtitles(meta);

      // Ignore a request that finished after the user changed media.
      if (getMediaKey(get().meta) !== mediaKey) return;

      if (externalCaptions.length > 0) {
        set((s) => {
          // Add external captions to the existing list, avoiding duplicates
          const existingIds = new Set(s.captionList.map((c) => c.id));
          const newCaptions = externalCaptions.filter(
            (c) => !existingIds.has(c.id),
          );
          s.externalCaptionList = externalCaptions;
          s.captionList = [...s.captionList, ...newCaptions];
        });
        console.log(`Added ${externalCaptions.length} external captions`);
        void get().reclassifyMislabeledEnglishCaptions();
      }
    } catch (error) {
      console.error("Failed to scrape external subtitles:", error);
    } finally {
      set((s) => {
        if (s.externalSubtitlesMediaKey === mediaKey) {
          s.isLoadingExternalSubtitles = false;
        }
      });
    }
  },

  clearTranslateTask() {
    set((s) => {
      if (s.caption.translateTask) {
        s.caption.translateTask.cancel();
      }
      s.caption.translateTask = null;
    });
  },

  async translateCaption(
    targetCaption: CaptionListItem,
    targetLanguage: string,
  ) {
    let store = get();

    if (store.caption.translateTask) {
      console.warn("A translation task is already in progress");
      return;
    }

    const abortController = new AbortController();

    set((s) => {
      s.caption.translateTask = {
        targetCaption,
        targetLanguage,
        done: false,
        error: false,
        cancel() {
          if (!this.done && !this.error) {
            console.log("Translation task was cancelled");
          }
          abortController.abort();
        },
      };
    });

    function handleError(err: any) {
      if (abortController.signal.aborted) {
        return;
      }
      console.error("Translation task ran into an error", err);
      set((s) => {
        if (!s.caption.translateTask) return;
        s.caption.translateTask.error = true;
      });
    }

    try {
      const srtData = await downloadCaption(targetCaption);
      if (abortController.signal.aborted) {
        return;
      }
      if (!srtData) {
        throw new Error("Fetching failed");
      }
      set((s) => {
        if (!s.caption.translateTask) return;
        s.caption.translateTask.fetchedTargetCaption = {
          id: targetCaption.id,
          language: targetCaption.language,
          srtData,
        };
      });
      store = get();
    } catch (err) {
      handleError(err);
      return;
    }

    try {
      const result = await translate(
        store.caption.translateTask!.fetchedTargetCaption!,
        targetLanguage,
        googletranslate,
        abortController.signal,
      );
      if (abortController.signal.aborted) {
        return;
      }
      if (!result) {
        throw new Error("Translation failed");
      }
      set((s) => {
        if (!s.caption.translateTask) return;
        const translatedCaption: Caption = {
          id: `${targetCaption.id}-translated-${targetLanguage}`,
          language: targetLanguage,
          srtData: result,
        };
        s.caption.translateTask.done = true;
        s.caption.translateTask.translatedCaption = translatedCaption;
      });
    } catch (err) {
      handleError(err);
    }
  },
});
