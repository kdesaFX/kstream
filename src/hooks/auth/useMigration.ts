import { useCallback } from "react";

// import { SessionResponse } from "@/backend/accounts/auth";
import { bookmarkMediaToInput } from "@/backend/accounts/bookmarks";
import {
  base64ToBuffer,
  bytesToBase64,
  bytesToBase64Url,
  // keysFromMnemonic,
  keysFromSeed,
  signChallenge,
} from "@/backend/accounts/crypto";
import { importAllUserData } from "@/backend/accounts/import";
// import { getLoginChallengeToken, loginAccount } from "@/backend/accounts/login";
import { progressMediaItemToInputs } from "@/backend/accounts/progress";
import {
  getRegisterChallengeToken,
  registerAccount,
} from "@/backend/accounts/register";
import { buildFullSettingsInput } from "@/backend/accounts/settings";
import { watchHistoryItemsToInputs } from "@/backend/accounts/watchHistory";
// import { removeSession } from "@/backend/accounts/sessions";
// import { getSettings } from "@/backend/accounts/settings";
// import {
//   UserResponse,
//   getBookmarks,
//   getProgress,
//   getUser,
// } from "@/backend/accounts/user";
import { useAuthData } from "@/hooks/auth/useAuthData";
// import { useBackendUrl } from "@/hooks/auth/useBackendUrl";
import { AccountWithToken, useAuthStore } from "@/stores/auth";
import { BookmarkMediaItem, useBookmarkStore } from "@/stores/bookmarks";
import { useGroupOrderStore } from "@/stores/groupOrder";
import { useLanguageStore } from "@/stores/language";
import { usePreferencesStore } from "@/stores/preferences";
import { ProgressMediaItem, useProgressStore } from "@/stores/progress";
import { useSubtitleStore } from "@/stores/subtitles";
import { useThemeStore } from "@/stores/theme";
import { WatchHistoryItem, useWatchHistoryStore } from "@/stores/watchHistory";

export interface RegistrationData {
  recaptchaToken?: string;
  mnemonic: string;
  userData: {
    device: string;
    profile: {
      colorA: string;
      colorB: string;
      icon: string;
    };
  };
}

export interface LoginData {
  mnemonic: string;
  userData: {
    device: string;
  };
}

export function useMigration() {
  const currentAccount = useAuthStore((s) => s.account);
  const progress = useProgressStore((s) => s.items);
  const watchHistory = useWatchHistoryStore((s) => s.items);
  const bookmarks = useBookmarkStore((s) => s.bookmarks);
  const groupOrder = useGroupOrderStore((s) => s.groupOrder);
  const preferences = usePreferencesStore.getState();
  const subtitleLanguage = useSubtitleStore((s) => s.lastSelectedLanguage);
  const applicationLanguage = useLanguageStore((s) => s.language);
  const applicationTheme = useThemeStore((s) => s.theme);
  const { login: userDataLogin } = useAuthData();

  const migrate = useCallback(
    async (backendUrl: string, recaptchaToken?: string) => {
      if (!currentAccount?.seed) return;

      const importData = async (
        backendUrlInner: string,
        account: AccountWithToken,
        progressItems: Record<string, ProgressMediaItem>,
        watchHistoryItems: Record<string, WatchHistoryItem>,
        bookmarkItems: Record<string, BookmarkMediaItem>,
        groupOrderItems: string[],
      ) => {
        const progressInputs = Object.entries(progressItems).flatMap(
          ([tmdbId, item]) => progressMediaItemToInputs(tmdbId, item),
        );
        const watchHistoryInputs = watchHistoryItemsToInputs(watchHistoryItems);
        const bookmarkInputs = Object.entries(bookmarkItems).map(
          ([tmdbId, item]) => bookmarkMediaToInput(tmdbId, item),
        );

        await importAllUserData(backendUrlInner, account, {
          progressInputs,
          watchHistoryInputs,
          bookmarkInputs,
          groupOrder: groupOrderItems,
          settings: buildFullSettingsInput(preferences, {
            applicationLanguage,
            applicationTheme: applicationTheme ?? undefined,
            defaultSubtitleLanguage: subtitleLanguage || undefined,
          }),
        });
      };

      const { challenge } = await getRegisterChallengeToken(
        backendUrl,
        recaptchaToken || undefined, // Pass undefined if token is not provided
      );
      const keys = await keysFromSeed(base64ToBuffer(currentAccount.seed));
      const signature = await signChallenge(keys, challenge);
      const registerResult = await registerAccount(backendUrl, {
        challenge: {
          code: challenge,
          signature,
        },
        publicKey: bytesToBase64Url(keys.publicKey),
        device: currentAccount.deviceName,
        profile: currentAccount.profile,
      });

      const account = await userDataLogin(
        registerResult,
        registerResult.user,
        registerResult.session,
        bytesToBase64(keys.seed),
      );

      await importData(
        backendUrl,
        account,
        progress,
        watchHistory,
        bookmarks,
        groupOrder,
      );

      return account;
    },
    [
      currentAccount,
      userDataLogin,
      bookmarks,
      progress,
      watchHistory,
      groupOrder,
      preferences,
      subtitleLanguage,
      applicationLanguage,
      applicationTheme,
    ],
  );

  return {
    migrate,
  };
}
