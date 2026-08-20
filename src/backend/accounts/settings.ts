import {
  fetchSettings,
  upsertSettings,
} from "@/backend/supabase/data";
import { AccountWithToken, useAuthStore } from "@/stores/auth";
import { PreferencesStore, usePreferencesStore } from "@/stores/preferences";
import {
  deviceProfileToSettingsPatch,
  type DeviceProfile,
  type DeviceProfileSnapshot,
  type PosterQuality,
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
    enableThumbnails: preferences.enableThumbnails,
    enableAutoplay: preferences.enableAutoplay,
    enableSkipCredits: preferences.enableSkipCredits,
    enableAutoSkipSegments: preferences.enableAutoSkipSegments,
    enableDiscover: preferences.enableDiscover,
    enableMatureTitles: preferences.enableMatureTitles,
    enableFeatured: preferences.enableFeatured,
    enableDetailsModal: preferences.enableDetailsModal,
    enableImageLogos: preferences.enableImageLogos,
    enableCarouselView: preferences.enableCarouselView,
    enableMinimalCards: preferences.enableMinimalCards,
    forceCompactEpisodeView: preferences.forceCompactEpisodeView,
    sourceOrder:
      preferences.sourceOrder.length > 0 ? preferences.sourceOrder : undefined,
    enableSourceOrder: preferences.enableSourceOrder,
    lastSuccessfulSource: preferences.lastSuccessfulSource,
    enableLastSuccessfulSource: preferences.enableLastSuccessfulSource,
    embedOrder:
      preferences.embedOrder.length > 0 ? preferences.embedOrder : undefined,
    enableEmbedOrder: preferences.enableEmbedOrder,
    proxyTmdb: preferences.proxyTmdb,
    enableLowPerformanceMode: preferences.enableLowPerformanceMode,
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
    enablePauseOverlay: preferences.enablePauseOverlay,
    enableNumberKeySeeking: preferences.enableNumberKeySeeking,
    keyboardShortcuts: preferences.keyboardShortcuts,
    bookmarkRowsToShow: preferences.bookmarkRowsToShow,
    watchingRowsToShow: preferences.watchingRowsToShow,
    enableGamepadControls: preferences.enableGamepadControls,
    gamepadMapping: preferences.gamepadMapping,
    proxyArtwork: preferences.proxyArtwork,
    posterQuality: preferences.posterQuality,
    lastAppliedDeviceProfile: preferences.lastAppliedDeviceProfile,
    deviceProfileSnapshot: preferences.deviceProfileSnapshot,
  };
}

export async function syncDeviceProfileSettings(
  _url: string | null | undefined,
  account: AccountWithToken | null | undefined,
): Promise<void> {
  if (!account) return;
  await updateSettings("", account, deviceProfileToSettingsPatch(usePreferencesStore.getState()));
}
