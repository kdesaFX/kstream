import merge from "lodash.merge";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

import { isFirefox } from "@/utils/browser/detectFeatures";

export interface SubtitleStyling {
  /**
   * Text color of subtitles, hex string
   */
  color: string;

  /**
   * size percentage, ranges between 0.01 and 2
   */
  size: number;

  /**
   * background opacity, ranges between 0 and 1
   */
  backgroundOpacity: number;

  /**
   * background blur, ranges between 0 and 1
   */
  backgroundBlur: number;

  /**
   * whether background blur is enabled (disabled by default on Firefox due to flickering issues)
   */
  backgroundBlurEnabled: boolean;

  /**
   * bold, boolean
   */
  bold: boolean;

  /**
   * vertical position percentage, ranges between 1 and 3 (rem)
   */
  verticalPosition: number;

  /**
   * font style for text rendering
   * "default" | "raised" | "depressed" | "Border" | "dropShadow"
   */
  fontStyle: string;

  /**
   * border thickness for Border font style, ranges between 0 and 10
   */
  borderThickness: number;

  /**
   * line height multiplier for subtitle text, ranges between 1.0 and 2.5
   */
  lineHeight: number;
}

/** Per movie / episode caption choices (delay, track, enabled). */
export interface MediaSubtitlePrefs {
  delay: number;
  enabled: boolean;
  language: string | null;
  subtitleId: string | null;
  overrideCasing: boolean;
}

export interface SubtitleStore {
  lastSync: {
    lastSelectedLanguage: string | null;
  };
  enabled: boolean;
  lastSelectedLanguage: string | null;
  lastSelectedSubtitleId: string | null;
  isOpenSubtitles: boolean;
  styling: SubtitleStyling;
  overrideCasing: boolean;
  delay: number;
  showDelayIndicator: boolean;
  /** Keys from getMediaKey — movie or specific episode. */
  prefsByMedia: Record<string, MediaSubtitlePrefs>;
  updateStyling(newStyling: Partial<SubtitleStyling>): void;
  resetStyling(): void;
  setSubtitle(
    enabled: boolean,
    language?: string | null,
    subtitleId?: string | null,
  ): void;
  setIsOpenSubtitles(isOpenSubtitles: boolean): void;
  setOverrideCasing(enabled: boolean): void;
  setDelay(delay: number): void;
  importSubtitleLanguage(lang: string | null): void;
  resetSubtitleSpecificSettings(): void;
  setShowDelayIndicator: (show: boolean) => void;
  applyPrefsForMedia(mediaKey: string): void;
  savePrefsForMedia(mediaKey: string): void;
}

export const useSubtitleStore = create(
  persist(
    immer<SubtitleStore>((set) => ({
      enabled: false,
      lastSync: {
        lastSelectedLanguage: null,
      },
      lastSelectedLanguage: null,
      lastSelectedSubtitleId: null,
      isOpenSubtitles: false,
      overrideCasing: false,
      delay: 0,
      prefsByMedia: {},
      styling: {
        color: "#ffffff",
        backgroundOpacity: 0.5,
        size: 1,
        backgroundBlur: 0.5,
        backgroundBlurEnabled: !isFirefox,
        bold: false,
        verticalPosition: 1,
        fontStyle: "default",
        borderThickness: 1,
        lineHeight: 1.5,
      },
      showDelayIndicator: false,
      resetSubtitleSpecificSettings() {
        set((s) => {
          // Delay is remembered per movie/episode — don't wipe it on track change.
          s.overrideCasing = false;
        });
      },
      applyPrefsForMedia(mediaKey) {
        set((s) => {
          const prefs = s.prefsByMedia[mediaKey];
          if (!prefs) {
            // New title: don't carry over the previous title's delay.
            s.delay = 0;
            s.overrideCasing = false;
            return;
          }
          s.delay = Math.max(Math.min(500, prefs.delay), -500);
          s.enabled = prefs.enabled;
          s.lastSelectedLanguage = prefs.language;
          s.lastSelectedSubtitleId = prefs.subtitleId;
          s.overrideCasing = prefs.overrideCasing;
        });
      },
      savePrefsForMedia(mediaKey) {
        set((s) => {
          s.prefsByMedia[mediaKey] = {
            delay: s.delay,
            enabled: s.enabled,
            language: s.lastSelectedLanguage,
            subtitleId: s.lastSelectedSubtitleId,
            overrideCasing: s.overrideCasing,
          };
        });
      },
      setIsOpenSubtitles(isOpenSubtitles) {
        set((s) => {
          s.isOpenSubtitles = isOpenSubtitles;
        });
      },
      updateStyling(newStyling) {
        set((s) => {
          if (newStyling.backgroundOpacity !== undefined)
            s.styling.backgroundOpacity = Math.min(
              1,
              Math.max(0, newStyling.backgroundOpacity),
            );
          if (newStyling.backgroundBlur !== undefined)
            s.styling.backgroundBlur = Math.min(
              1,
              Math.max(0, newStyling.backgroundBlur),
            );
          if (newStyling.backgroundBlurEnabled !== undefined)
            s.styling.backgroundBlurEnabled = newStyling.backgroundBlurEnabled;
          if (newStyling.color !== undefined)
            s.styling.color = newStyling.color.toLowerCase();
          if (newStyling.size !== undefined)
            s.styling.size = Math.min(10, Math.max(0.01, newStyling.size));
          if (newStyling.bold !== undefined) s.styling.bold = newStyling.bold;
          if (newStyling.verticalPosition !== undefined)
            s.styling.verticalPosition = Math.min(
              100,
              Math.max(0, newStyling.verticalPosition),
            );
          if (newStyling.fontStyle !== undefined)
            s.styling.fontStyle = newStyling.fontStyle;
          if (newStyling.borderThickness !== undefined)
            s.styling.borderThickness = Math.min(
              10,
              Math.max(0, newStyling.borderThickness),
            );
          if (newStyling.lineHeight !== undefined)
            s.styling.lineHeight = Math.min(
              2.5,
              Math.max(1, newStyling.lineHeight),
            );
        });
      },
      resetStyling() {
        set((s) => {
          s.styling = {
            color: "#ffffff",
            backgroundOpacity: 0.5,
            size: 1,
            backgroundBlur: 0.5,
            backgroundBlurEnabled: !isFirefox,
            bold: false,
            verticalPosition: 1,
            fontStyle: "default",
            borderThickness: 1,
            lineHeight: 1.5,
          };
        });
      },
      setSubtitle(enabled, language, subtitleId) {
        set((s) => {
          s.enabled = enabled;
          // Keep last language/id when turning captions off so toggle + per-media
          // restore can bring the same track back.
          if (enabled) {
            if (language !== undefined)
              s.lastSelectedLanguage = language ?? null;
            if (subtitleId !== undefined)
              s.lastSelectedSubtitleId = subtitleId ?? null;
          }
        });
      },
      setOverrideCasing(enabled) {
        set((s) => {
          s.overrideCasing = enabled;
        });
      },
      setDelay(delay) {
        set((s) => {
          s.delay = Math.max(Math.min(500, delay), -500);
        });
      },
      importSubtitleLanguage(lang) {
        set((s) => {
          s.lastSelectedLanguage = lang;
          s.lastSync.lastSelectedLanguage = lang;
        });
      },
      setShowDelayIndicator(show: boolean) {
        set((s) => {
          s.showDelayIndicator = show;
        });
      },
    })),
    {
      name: "__MW::subtitles",
      merge: (persisted, current) => {
        const merged = merge({}, current, persisted) as SubtitleStore;
        if (!merged.prefsByMedia) merged.prefsByMedia = {};
        return merged;
      },
    },
  ),
);
