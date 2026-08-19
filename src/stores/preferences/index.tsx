import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

import {
  applyLowPerformanceRestrictions,
  captureLowPerformanceSnapshot,
  restoreLowPerformanceSnapshot,
  type LowPerformanceSnapshot,
} from "@/stores/preferences/lowPerformance";
import {
  DEFAULT_KEYBOARD_SHORTCUTS,
  KeyboardShortcuts,
} from "@/utils/browser/keyboardShortcuts";

export type PreferredMinimumResolution = "none" | "720" | "1080" | "4k";
export type VolumeBoostApplyMode = "current" | "title";

/** Prefer the source that worked for this title only (never bleed across titles). */
export function getPreferredSourceForTitle(
  preferredSourceByTitle: Record<string, string>,
  tmdbId: string | undefined | null,
  _lastSuccessfulSource?: string | null,
): string | null {
  if (tmdbId && preferredSourceByTitle[tmdbId]) {
    return preferredSourceByTitle[tmdbId];
  }
  return null;
}

export interface PreferencesStore {
  enableThumbnails: boolean;
  enableAutoplay: boolean;
  enableSkipCredits: boolean;
  enableAutoSkipSegments: boolean;
  enableDiscover: boolean;
  enableMangaDiscover: boolean;
  mangaReaderMode: "vertical" | "paged";
  mangaPreferredLanguage: string;
  enableMatureTitles: boolean;
  enableFeatured: boolean;
  enableDetailsModal: boolean;
  enableImageLogos: boolean;
  enableCarouselView: boolean;
  enableMinimalCards: boolean;
  forceCompactEpisodeView: boolean;
  sourceOrder: string[];
  enableSourceOrder: boolean;
  lastSuccessfulSource: string | null;
  enableLastSuccessfulSource: boolean;
  /** Last audio language the user picked (e.g. "en", "ja"). */
  preferredAudioLanguage: string | null;
  /** Per-title (TMDB id) source that last worked for that show/movie. */
  preferredSourceByTitle: Record<string, string>;
  embedOrder: string[];
  enableEmbedOrder: boolean;
  proxyTmdb: boolean;
  febboxKey: string | null;
  febboxUseMp4: boolean;
  debridToken: string | null;
  debridService: string;
  tidbKey: string | null;
  wyzieKey: string | null;
  enableLowPerformanceMode: boolean;
  /** Settings captured right before performance mode turned them off. */
  lowPerformanceSnapshot: LowPerformanceSnapshot | null;
  enableNativeSubtitles: boolean;
  enableAutoSubtitleSync: boolean;
  enableHoldToBoost: boolean;
  homeSectionOrder: string[];
  bookmarkRowsToShow: number;
  watchingRowsToShow: number;
  readingRowsToShow: number;
  manualSourceSelection: boolean;
  preferredMinimumResolution: PreferredMinimumResolution;
  enableDoubleClickToSeek: boolean;
  enableAutoResumeOnPlaybackError: boolean;
  enableNumberKeySeeking: boolean;
  enablePauseOverlay: boolean;
  enableGamepadControls: boolean;
  gamepadMapping: Record<string, string>;
  keyboardShortcuts: KeyboardShortcuts;
  videoBrightness: number;
  videoContrast: number;
  videoSaturation: number;
  videoHueRotate: number;
  volumeBoost: number;
  volumeBoostApplyMode: VolumeBoostApplyMode;
  volumeBoostByTitle: Record<string, number>;

  setEnableThumbnails(v: boolean): void;
  setEnableAutoplay(v: boolean): void;
  setEnableSkipCredits(v: boolean): void;
  setEnableAutoSkipSegments(v: boolean): void;
  setEnableDiscover(v: boolean): void;
  setEnableMangaDiscover(v: boolean): void;
  setMangaReaderMode(v: "vertical" | "paged"): void;
  setMangaPreferredLanguage(v: string): void;
  setEnableMatureTitles(v: boolean): void;
  setEnableFeatured(v: boolean): void;
  setEnableDetailsModal(v: boolean): void;
  setEnableImageLogos(v: boolean): void;
  setEnableCarouselView(v: boolean): void;
  setEnableMinimalCards(v: boolean): void;
  setForceCompactEpisodeView(v: boolean): void;
  setSourceOrder(v: string[]): void;
  setEnableSourceOrder(v: boolean): void;
  setLastSuccessfulSource(v: string | null): void;
  setEnableLastSuccessfulSource(v: boolean): void;
  setPreferredAudioLanguage(v: string | null): void;
  rememberSuccessfulSource(tmdbId: string | null | undefined, sourceId: string): void;
  clearPreferredSourceForTitle(tmdbId: string): void;
  setEmbedOrder(v: string[]): void;
  setEnableEmbedOrder(v: boolean): void;
  setProxyTmdb(v: boolean): void;
  setFebboxKey(v: string | null): void;
  setFebboxUseMp4(v: boolean): void;
  setdebridToken(v: string | null): void;
  setdebridService(v: string): void;
  setTIDBKey(v: string | null): void;
  setWyzieKey(v: string | null): void;
  setEnableLowPerformanceMode(v: boolean): void;
  rememberLowPerformanceSnapshot(snapshot: LowPerformanceSnapshot): void;
  setEnableNativeSubtitles(v: boolean): void;
  setEnableAutoSubtitleSync(v: boolean): void;
  setEnableHoldToBoost(v: boolean): void;
  setHomeSectionOrder(v: string[]): void;
  setBookmarkRowsToShow(v: number): void;
  setWatchingRowsToShow(v: number): void;
  setReadingRowsToShow(v: number): void;
  setManualSourceSelection(v: boolean): void;
  setPreferredMinimumResolution(v: PreferredMinimumResolution): void;
  setEnableDoubleClickToSeek(v: boolean): void;
  setEnableAutoResumeOnPlaybackError(v: boolean): void;
  setEnableNumberKeySeeking(v: boolean): void;
  setEnablePauseOverlay(v: boolean): void;
  setEnableGamepadControls(v: boolean): void;
  setGamepadMapping(v: Record<string, string>): void;
  setKeyboardShortcuts(v: KeyboardShortcuts): void;
  setVideoBrightness(v: number): void;
  setVideoContrast(v: number): void;
  setVideoSaturation(v: number): void;
  setVideoHueRotate(v: number): void;
  setVolumeBoost(v: number): void;
  setVolumeBoostApplyMode(v: VolumeBoostApplyMode): void;
  setVolumeBoostForTitle(titleKey: string, boost: number): void;
  clearVolumeBoostForTitle(titleKey: string): void;
  applySync(partial: Partial<PreferencesStore>): void;
}

export const usePreferencesStore = create(
  persist(
    immer<PreferencesStore>((set) => ({
      enableThumbnails: false,
      enableAutoplay: true,
      enableSkipCredits: true,
      enableAutoSkipSegments: false,
      enableDiscover: true,
      enableMangaDiscover: true,
      mangaReaderMode: "vertical",
      mangaPreferredLanguage: "en",
      enableMatureTitles: false,
      enableFeatured: false,
      enableDetailsModal: false,
      enableImageLogos: true,
      enableCarouselView: false,
      enableMinimalCards: false,
      forceCompactEpisodeView: false,
      sourceOrder: [],
      enableSourceOrder: false,
      lastSuccessfulSource: null,
      enableLastSuccessfulSource: true,
      preferredAudioLanguage: null,
      preferredSourceByTitle: {},
      embedOrder: [],
      enableEmbedOrder: false,
      proxyTmdb: false,
      febboxKey: null,
      febboxUseMp4: false,
      debridToken: null,
      debridService: "realdebrid",
      tidbKey: null,
      wyzieKey: null,
      enableLowPerformanceMode: false,
      lowPerformanceSnapshot: null,
      enableNativeSubtitles: false,
      enableAutoSubtitleSync: false,
      enableHoldToBoost: true,
      homeSectionOrder: ["watching", "reading"],
      bookmarkRowsToShow: 1,
      watchingRowsToShow: 1,
      readingRowsToShow: 1,
      manualSourceSelection: false,
      preferredMinimumResolution: "none",
      enableDoubleClickToSeek: false,
      enableAutoResumeOnPlaybackError: true,
      enableNumberKeySeeking: true,
      enablePauseOverlay: false,
      enableGamepadControls: false,
      gamepadMapping: {},
      keyboardShortcuts: DEFAULT_KEYBOARD_SHORTCUTS,
      videoBrightness: 100,
      videoContrast: 100,
      videoSaturation: 100,
      videoHueRotate: 0,
      volumeBoost: 100,
      volumeBoostApplyMode: "current",
      volumeBoostByTitle: {},
      setEnableThumbnails(v) {
        set((s) => {
          s.enableThumbnails = v;
        });
      },
      setEnableAutoplay(v) {
        set((s) => {
          s.enableAutoplay = v;
        });
      },
      setEnableSkipCredits(v) {
        set((s) => {
          s.enableSkipCredits = v;
        });
      },
      setEnableAutoSkipSegments(v) {
        set((s) => {
          s.enableAutoSkipSegments = v;
        });
      },
      setEnableDiscover(v) {
        set((s) => {
          s.enableDiscover = v;
        });
      },
      setEnableMangaDiscover(v) {
        set((s) => {
          s.enableMangaDiscover = v;
        });
      },
      setMangaReaderMode(v) {
        set((s) => {
          s.mangaReaderMode = v;
        });
      },
      setMangaPreferredLanguage(v) {
        set((s) => {
          s.mangaPreferredLanguage = v;
        });
      },
      setEnableMatureTitles(v) {
        set((s) => {
          s.enableMatureTitles = v;
        });
      },
      setEnableFeatured(v) {
        set((s) => {
          s.enableFeatured = v;
        });
      },
      setEnableDetailsModal(v) {
        set((s) => {
          s.enableDetailsModal = v;
        });
      },
      setEnableImageLogos(v) {
        set((s) => {
          s.enableImageLogos = v;
        });
      },
      setEnableCarouselView(v) {
        set((s) => {
          s.enableCarouselView = v;
        });
      },
      setEnableMinimalCards(v) {
        set((s) => {
          s.enableMinimalCards = v;
        });
      },
      setForceCompactEpisodeView(v) {
        set((s) => {
          s.forceCompactEpisodeView = v;
        });
      },
      setSourceOrder(v) {
        set((s) => {
          s.sourceOrder = v;
        });
      },
      setEnableSourceOrder(v) {
        set((s) => {
          s.enableSourceOrder = v;
        });
      },
      setLastSuccessfulSource(v) {
        set((s) => {
          s.lastSuccessfulSource = v;
        });
      },
      setEnableLastSuccessfulSource(v) {
        set((s) => {
          s.enableLastSuccessfulSource = v;
        });
      },
      setPreferredAudioLanguage(v) {
        set((s) => {
          s.preferredAudioLanguage = v;
        });
      },
      rememberSuccessfulSource(tmdbId, sourceId) {
        set((s) => {
          s.lastSuccessfulSource = sourceId;
          if (tmdbId) {
            s.preferredSourceByTitle[tmdbId] = sourceId;
          }
        });
      },
      clearPreferredSourceForTitle(tmdbId) {
        set((s) => {
          delete s.preferredSourceByTitle[tmdbId];
        });
      },
      setEmbedOrder(v) {
        set((s) => {
          s.embedOrder = v;
        });
      },
      setEnableEmbedOrder(v) {
        set((s) => {
          s.enableEmbedOrder = v;
        });
      },
      setProxyTmdb(v) {
        set((s) => {
          s.proxyTmdb = v;
        });
      },
      setFebboxKey(v) {
        set((s) => {
          s.febboxKey = v;
        });
      },
      setFebboxUseMp4(v) {
        set((s) => {
          s.febboxUseMp4 = v;
        });
      },
      setdebridToken(v) {
        set((s) => {
          s.debridToken = v;
        });
      },
      setdebridService(v) {
        set((s) => {
          s.debridService = v;
        });
      },
      setTIDBKey(v) {
        set((s) => {
          s.tidbKey = v;
        });
      },
      setWyzieKey(v) {
        set((s) => {
          s.wyzieKey = v;
        });
      },
      setEnableLowPerformanceMode(v) {
        set((s) => {
          if (v) {
            s.enableLowPerformanceMode = true;
            applyLowPerformanceRestrictions(s);
            return;
          }
          s.enableLowPerformanceMode = false;
          restoreLowPerformanceSnapshot(s, s.lowPerformanceSnapshot);
          s.lowPerformanceSnapshot = null;
        });
      },
      rememberLowPerformanceSnapshot(snapshot) {
        set((s) => {
          if (s.lowPerformanceSnapshot) return;
          s.lowPerformanceSnapshot = captureLowPerformanceSnapshot(snapshot);
        });
      },
      setEnableNativeSubtitles(v) {
        set((s) => {
          s.enableNativeSubtitles = v;
        });
      },
      setEnableAutoSubtitleSync(v) {
        set((s) => {
          s.enableAutoSubtitleSync = v;
        });
      },
      setEnableHoldToBoost(v) {
        set((s) => {
          s.enableHoldToBoost = v;
        });
      },
      setHomeSectionOrder(v) {
        set((s) => {
          s.homeSectionOrder = v;
        });
      },
      setBookmarkRowsToShow(v) {
        set((s) => {
          s.bookmarkRowsToShow = v;
        });
      },
      setWatchingRowsToShow(v) {
        set((s) => {
          s.watchingRowsToShow = v;
        });
      },
      setReadingRowsToShow(v) {
        set((s) => {
          s.readingRowsToShow = v;
        });
      },
      setManualSourceSelection(v) {
        set((s) => {
          s.manualSourceSelection = v;
        });
      },
      setPreferredMinimumResolution(v) {
        set((s) => {
          s.preferredMinimumResolution = v;
        });
      },
      setEnableDoubleClickToSeek(v) {
        set((s) => {
          s.enableDoubleClickToSeek = v;
        });
      },
      setEnableAutoResumeOnPlaybackError(v) {
        set((s) => {
          s.enableAutoResumeOnPlaybackError = v;
        });
      },
      setEnableNumberKeySeeking(v) {
        set((s) => {
          s.enableNumberKeySeeking = v;
        });
      },
      setEnablePauseOverlay(v) {
        set((s) => {
          s.enablePauseOverlay = v;
        });
      },
      setEnableGamepadControls(v) {
        set((s) => {
          s.enableGamepadControls = v;
        });
      },
      setGamepadMapping(v) {
        set((s) => {
          s.gamepadMapping = v ?? {};
        });
      },
      setKeyboardShortcuts(v) {
        set((s) => {
          s.keyboardShortcuts = v ?? DEFAULT_KEYBOARD_SHORTCUTS;
        });
      },
      setVideoBrightness(v) {
        set((s) => {
          s.videoBrightness = v;
        });
      },
      setVolumeBoost(v) {
        set((s) => {
          s.volumeBoost = Math.min(600, Math.max(100, v));
        });
      },
      setVolumeBoostApplyMode(v) {
        set((s) => {
          s.volumeBoostApplyMode = v;
        });
      },
      setVolumeBoostForTitle(titleKey, boost) {
        set((s) => {
          s.volumeBoostByTitle[titleKey] = Math.min(600, Math.max(100, boost));
        });
      },
      clearVolumeBoostForTitle(titleKey) {
        set((s) => {
          delete s.volumeBoostByTitle[titleKey];
        });
      },
      setVideoContrast(v) {
        set((s) => {
          s.videoContrast = v;
        });
      },
      setVideoSaturation(v) {
        set((s) => {
          s.videoSaturation = v;
        });
      },
      setVideoHueRotate(v) {
        set((s) => {
          s.videoHueRotate = v;
        });
      },
      applySync(partial) {
        set((s) => {
          Object.assign(s, partial);
          if (partial.keyboardShortcuts !== undefined) {
            s.keyboardShortcuts = partial.keyboardShortcuts ?? DEFAULT_KEYBOARD_SHORTCUTS;
          }
          if (partial.gamepadMapping !== undefined) {
            s.gamepadMapping = partial.gamepadMapping ?? {};
          }
        });
      },
    })),
    {
      name: "__MW::preferences",
      merge: (persisted, current) => {
        const merged = {
          ...current,
          ...(persisted as Partial<PreferencesStore>),
        };
        if (!merged.keyboardShortcuts) {
          merged.keyboardShortcuts = DEFAULT_KEYBOARD_SHORTCUTS;
        }
        if (!merged.gamepadMapping) {
          merged.gamepadMapping = {};
        }
        if (!merged.volumeBoostByTitle) {
          merged.volumeBoostByTitle = {};
        }
        if (!merged.preferredSourceByTitle) {
          merged.preferredSourceByTitle = {};
        }
        if (merged.readingRowsToShow == null) {
          merged.readingRowsToShow = 1;
        }

        // Goated was renamed to Reyna — rewrite saved prefs so scrapes still hit it.
        const renameSourceId = (id: string) => (id === "goated" ? "reyna" : id);
        if (Array.isArray(merged.sourceOrder)) {
          merged.sourceOrder = merged.sourceOrder.map(renameSourceId);
        }
        if (merged.lastSuccessfulSource === "goated") {
          merged.lastSuccessfulSource = "reyna";
        }
        if (merged.preferredSourceByTitle) {
          for (const [tmdbId, sourceId] of Object.entries(
            merged.preferredSourceByTitle,
          )) {
            if (sourceId === "goated") {
              merged.preferredSourceByTitle[tmdbId] = "reyna";
            }
          }
        }

        return merged;
      },
    },
  ),
);
