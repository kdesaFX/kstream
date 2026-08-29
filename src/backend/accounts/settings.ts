import {
  fetchSettings,
  upsertSettings,
} from "@/backend/supabase/data";
import { AccountWithToken, useAuthStore } from "@/stores/auth";
import { PreferencesStore } from "@/stores/preferences";
import type {
  DeviceProfile,
  DeviceProfileSnapshot,
  PosterQuality,
  BackdropQuality,
} from "@/stores/preferences/deviceProfile";
import { KeyboardShortcuts } from "@/utils/browser/keyboardShortcuts";

export interface CustomThemeSettings {
  primary?: string;
  secondary?: string;
  tertiary?: string;
  activeTheme?: {
    primary: string;
    secondary: string;
    tertiary: string;
  };
  savedCustomThemes?: {
    id: string;
    name: string;
    primary: string;
    secondary: string;
    tertiary: string;
  }[];
  hiddenDefaultThemes?: string[];
}

export interface SettingsInput {
  applicationLanguage?: string;
  applicationTheme?: string | null;
  defaultSubtitleLanguage?: string;
  proxyUrls?: string[] | null;
  febboxKey?: string | null;
  debridToken?: string | null;
  debridService?: string;
  tidbKey?: string | null;
  wyzieKey?: string | null;
  enableThumbnails?: boolean;
  enableAutoplay?: boolean;
  enableSkipCredits?: boolean;
  enableAutoSkipSegments?: boolean;
  enableDiscover?: boolean;
  enableMatureTitles?: boolean;
  enableFeatured?: boolean;
  enableDetailsModal?: boolean;
  enableImageLogos?: boolean;
  enableCarouselView?: boolean;
  enableMinimalCards?: boolean;
  forceCompactEpisodeView?: boolean;
  sourceOrder?: string[] | null;
  enableSourceOrder?: boolean;
  lastSuccessfulSource?: string | null;
  enableLastSuccessfulSource?: boolean;
  embedOrder?: string[] | null;
  enableEmbedOrder?: boolean;
  proxyTmdb?: boolean;
  enableLowPerformanceMode?: boolean;
  enableNativeSubtitles?: boolean;
  enableHoldToBoost?: boolean;
  homeSectionOrder?: string[] | null;
  manualSourceSelection?: boolean;
  preferredMinimumResolution?: "none" | "720" | "1080" | "4k";
  enableDoubleClickToSeek?: boolean;
  enableAutoResumeOnPlaybackError?: boolean;
  enablePauseOverlay?: boolean;
  enableNumberKeySeeking?: boolean;
  keyboardShortcuts?: KeyboardShortcuts;
  customTheme?: CustomThemeSettings;
  bookmarkRowsToShow?: number;
  watchingRowsToShow?: number;
  enableGamepadControls?: boolean;
  gamepadMapping?: Record<string, string>;
  proxyArtwork?: boolean;
  posterQuality?: PosterQuality;
  backdropQuality?: BackdropQuality;
  lastAppliedDeviceProfile?: DeviceProfile | null;
  deviceProfileSnapshot?: DeviceProfileSnapshot | null;
}

export type SettingsResponse = SettingsInput;

export function updateSettings(
  _url: string,
  account: AccountWithToken,
  settings: SettingsInput,
) {
  return upsertSettings(account.userId, settings).then(() => settings);
}

export function getSettings(_url: string, account: AccountWithToken) {
  return fetchSettings(account.userId);
}

export interface SettingsImportExtras {
  applicationLanguage?: string;
  applicationTheme?: string | null;
  defaultSubtitleLanguage?: string;
}

export function buildFullSettingsInput(
  preferences: PreferencesStore,
  extras: SettingsImportExtras,
): SettingsInput {
  return {
    ...extras,
    proxyUrls: useAuthStore.getState().proxySet ?? undefined,
    febboxKey: preferences.febboxKey,
    debridToken: preferences.debridToken,
    debridService: preferences.debridService,
    tidbKey: preferences.tidbKey,
    wyzieKey: preferences.wyzieKey,
    enableSkipCredits: preferences.enableSkipCredits,
    enableAutoSkipSegments: preferences.enableAutoSkipSegments,
    enableMatureTitles: preferences.enableMatureTitles,
    enableMinimalCards: preferences.enableMinimalCards,
    sourceOrder:
      preferences.sourceOrder.length > 0 ? preferences.sourceOrder : undefined,
    enableSourceOrder: preferences.enableSourceOrder,
    lastSuccessfulSource: preferences.lastSuccessfulSource,
    enableLastSuccessfulSource: preferences.enableLastSuccessfulSource,
    embedOrder:
      preferences.embedOrder.length > 0 ? preferences.embedOrder : undefined,
    enableEmbedOrder: preferences.enableEmbedOrder,
    enableNativeSubtitles: preferences.enableNativeSubtitles,
    enableHoldToBoost: preferences.enableHoldToBoost,
    homeSectionOrder:
      preferences.homeSectionOrder.length > 0
        ? preferences.homeSectionOrder
        : undefined,
    manualSourceSelection: preferences.manualSourceSelection,
    preferredMinimumResolution: preferences.preferredMinimumResolution,
    enableDoubleClickToSeek: preferences.enableDoubleClickToSeek,
    enableAutoResumeOnPlaybackError: preferences.enableAutoResumeOnPlaybackError,
    enableNumberKeySeeking: preferences.enableNumberKeySeeking,
    keyboardShortcuts: preferences.keyboardShortcuts,
    bookmarkRowsToShow: preferences.bookmarkRowsToShow,
    watchingRowsToShow: preferences.watchingRowsToShow,
    enableGamepadControls: preferences.enableGamepadControls,
    gamepadMapping: preferences.gamepadMapping,
  };
}

/** No-op: Optimize / device-profile prefs stay on this device only. */
export async function syncDeviceProfileSettings(
  _url: string | null | undefined,
  _account: AccountWithToken | null | undefined,
): Promise<void> {
  return undefined;
}
