import { useCallback } from "react";

import { SessionResponse } from "@/backend/accounts/auth";
import { bookmarkMediaToInput } from "@/backend/accounts/bookmarks";
import {
  authenticatePasskey,
  bytesToBase64,
  bytesToBase64Url,
  createPasskey,
  getCredentialId,
  keysFromCredentialId,
  keysFromMnemonic,
  signChallenge,
  storeCredentialMapping,
} from "@/backend/accounts/crypto";
import { getGroupOrder } from "@/backend/accounts/groupOrder";
import { importAllUserData } from "@/backend/accounts/import";
import { getLoginChallengeToken, loginAccount } from "@/backend/accounts/login";
import {
  addPassword as addPasswordRequest,
  loginWithPassword as loginWithPasswordRequest,
  migrateToPassword as migrateToPasswordRequest,
  registerWithPassword as registerWithPasswordRequest,
} from "@/backend/accounts/password";
import { progressMediaItemToInputs } from "@/backend/accounts/progress";
import {
  getRegisterChallengeToken,
  registerAccount,
} from "@/backend/accounts/register";
import { removeSession } from "@/backend/accounts/sessions";
import {
  buildFullSettingsInput,
  getSettings,
} from "@/backend/accounts/settings";
import {
  UserResponse,
  bookmarkResponsesToEntries,
  getBookmarksPage,
  getProgressPage,
  getUser,
  getWatchHistory,
  mergeProgressItems,
  progressResponsesToEntries,
} from "@/backend/accounts/user";
import { watchHistoryItemsToInputs } from "@/backend/accounts/watchHistory";
import { useAuthData } from "@/hooks/auth/useAuthData";
import { useBackendUrl } from "@/hooks/auth/useBackendUrl";
import { AccountWithToken, useAuthStore } from "@/stores/auth";
import { BookmarkMediaItem, useBookmarkStore } from "@/stores/bookmarks";
import { useGroupOrderStore } from "@/stores/groupOrder";
import { useLanguageStore } from "@/stores/language";
import { usePreferencesStore } from "@/stores/preferences";
import { ProgressMediaItem, useProgressStore } from "@/stores/progress";
import { useSubtitleStore } from "@/stores/subtitles";
import { useThemeStore } from "@/stores/theme";
import { WatchHistoryItem } from "@/stores/watchHistory";
import { sleep } from "@/utils/translation/utils";

export interface RegistrationData {
  recaptchaToken?: string;
  mnemonic?: string;
  credentialId?: string;
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
  mnemonic?: string;
  credentialId?: string;
  userData: {
    device: string;
  };
}

// A single failed session-check request (network blip, backend cold start, a
// proxy/WAF hiccup) shouldn't be treated the same as a server explicitly
// rejecting the token. Only 401 is unambiguous - retry everything else a
// couple times with a short backoff before giving up.
async function getUserWithRetry(
  backendUrl: string,
  token: string,
  attempts = 3,
): ReturnType<typeof getUser> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await getUser(backendUrl, token);
    } catch (err) {
      const status = (err as any)?.response?.status;
      if (status === 401) throw err;
      lastErr = err;
      if (attempt < attempts - 1) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(500 * 2 ** attempt); // 500ms, 1000ms
      }
    }
  }
  throw lastErr;
}

const RESTORE_FIRST_PAGE_SIZE = 300;
const RESTORE_BACKGROUND_PAGE_SIZE = 500;

// Heavy accounts can have thousands of progress/bookmark rows -- fetching all
// of it before login can finish makes those accounts get slower to log into
// forever. Login only waits on the first page; the rest streams in after.
async function loadRemainingProgress(
  backendUrl: string,
  account: AccountWithToken,
  cursor: string | null,
) {
  let next = cursor;
  let accumulated = useProgressStore.getState().items;
  let changed = false;
  while (next) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const page = await getProgressPage(backendUrl, account, {
        limit: RESTORE_BACKGROUND_PAGE_SIZE,
        cursor: next,
      });
      accumulated = mergeProgressItems(
        accumulated,
        progressResponsesToEntries(page.items),
      );
      changed = true;
      next = page.nextCursor;
    } catch (err) {
      console.error("Failed to load remaining progress", err);
      break;
    }
  }
  if (changed) {
    useProgressStore
      .getState()
      .replaceItems(
        mergeProgressItems(useProgressStore.getState().items, accumulated),
      );
  }
}

async function loadRemainingBookmarks(
  backendUrl: string,
  account: AccountWithToken,
  cursor: string | null,
) {
  let next = cursor;
  let accumulated = useBookmarkStore.getState().bookmarks;
  let changed = false;
  while (next) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const page = await getBookmarksPage(backendUrl, account, {
        limit: RESTORE_BACKGROUND_PAGE_SIZE,
        cursor: next,
      });
      accumulated = {
        ...accumulated,
        ...bookmarkResponsesToEntries(page.items),
      };
      changed = true;
      next = page.nextCursor;
    } catch (err) {
      console.error("Failed to load remaining bookmarks", err);
      break;
    }
  }
  if (changed) {
    useBookmarkStore.getState().replaceBookmarks({
      ...useBookmarkStore.getState().bookmarks,
      ...accumulated,
    });
  }
}

export function useAuth() {
  const currentAccount = useAuthStore((s) => s.account);
  const profile = useAuthStore((s) => s.account?.profile);
  const loggedIn = !!useAuthStore((s) => s.account);
  const backendUrl = useBackendUrl();
  const {
    logout: userDataLogout,
    login: userDataLogin,
    syncData,
  } = useAuthData();
  const groupOrder = useGroupOrderStore((s) => s.groupOrder);
  const preferences = usePreferencesStore.getState();
  const subtitleLanguage = useSubtitleStore((s) => s.lastSelectedLanguage);
  const applicationLanguage = useLanguageStore((s) => s.language);
  const applicationTheme = useThemeStore((s) => s.theme);

  const login = useCallback(
    async (loginData: LoginData) => {
      if (!backendUrl) return;
      if (!loginData.mnemonic && !loginData.credentialId) {
        throw new Error("Either mnemonic or credentialId must be provided");
      }

      const keys = loginData.credentialId
        ? await keysFromCredentialId(loginData.credentialId)
        : await keysFromMnemonic(loginData.mnemonic!);
      const publicKeyBase64Url = bytesToBase64Url(keys.publicKey);

      // Try to get credential ID from storage if using mnemonic
      let credentialId: string | null = null;
      if (loginData.mnemonic) {
        credentialId = getCredentialId(backendUrl, publicKeyBase64Url);
      } else {
        credentialId = loginData.credentialId || null;
      }

      const { challenge } = await getLoginChallengeToken(
        backendUrl,
        publicKeyBase64Url,
      );
      const signature = await signChallenge(keys, challenge);
      const loginResult = await loginAccount(backendUrl, {
        challenge: {
          code: challenge,
          signature,
        },
        publicKey: publicKeyBase64Url,
        device: loginData.userData.device,
      });

      const user = await getUser(backendUrl, loginResult.token);
      const seedBase64 = bytesToBase64(keys.seed);

      // Store credential mapping if we have a credential ID
      if (credentialId) {
        storeCredentialMapping(backendUrl, publicKeyBase64Url, credentialId);
      }

      return userDataLogin(loginResult, user.user, user.session, seedBase64);
    },
    [userDataLogin, backendUrl],
  );

  const logout = useCallback(async () => {
    if (!currentAccount || !backendUrl) return;
    try {
      await removeSession(
        backendUrl,
        currentAccount.token,
        currentAccount.sessionId,
      );
    } catch {
      // we dont care about failing to delete session
    }
    await userDataLogout();
  }, [userDataLogout, backendUrl, currentAccount]);

  const disconnectFromBackend = useCallback(async () => {
    if (!currentAccount || !backendUrl) return;
    try {
      await removeSession(
        backendUrl,
        currentAccount.token,
        currentAccount.sessionId,
      );
    } catch {
      // we dont care about failing to delete session
    }
    // Only remove the account, keep all local data
    useAuthStore.getState().removeAccount();
  }, [backendUrl, currentAccount]);

  const register = useCallback(
    async (registerData: RegistrationData) => {
      if (!backendUrl) return;
      if (!registerData.mnemonic && !registerData.credentialId) {
        throw new Error("Either mnemonic or credentialId must be provided");
      }

      const { challenge } = await getRegisterChallengeToken(
        backendUrl,
        registerData.recaptchaToken,
      );
      const keys = registerData.credentialId
        ? await keysFromCredentialId(registerData.credentialId)
        : await keysFromMnemonic(registerData.mnemonic!);
      const signature = await signChallenge(keys, challenge);
      const publicKeyBase64Url = bytesToBase64Url(keys.publicKey);
      const registerResult = await registerAccount(backendUrl, {
        challenge: {
          code: challenge,
          signature,
        },
        publicKey: publicKeyBase64Url,
        device: registerData.userData.device,
        profile: registerData.userData.profile,
      });

      // Store credential mapping if we have a credential ID
      if (registerData.credentialId) {
        storeCredentialMapping(
          backendUrl,
          publicKeyBase64Url,
          registerData.credentialId,
        );
      }

      return userDataLogin(
        registerResult,
        registerResult.user,
        registerResult.session,
        bytesToBase64(keys.seed),
      );
    },
    [backendUrl, userDataLogin],
  );

  const registerWithPassword = useCallback(
    async (data: {
      username: string;
      password: string;
      device: string;
      profile: { colorA: string; colorB: string; icon: string };
    }) => {
      if (!backendUrl) return;
      const result = await registerWithPasswordRequest(backendUrl, data);
      return userDataLogin(result, result.user, result.session);
    },
    [backendUrl, userDataLogin],
  );

  const loginWithPassword = useCallback(
    async (data: { username: string; password: string; device: string }) => {
      if (!backendUrl) return;
      const result = await loginWithPasswordRequest(backendUrl, data);
      return userDataLogin(result, result.user, result.session);
    },
    [backendUrl, userDataLogin],
  );

  const registerWithPasskey = useCallback(
    async (
      device: string,
      accountProfile: { colorA: string; colorB: string; icon: string },
    ) => {
      if (!backendUrl) return;
      const passkey = await createPasskey(
        `user-${Date.now()}`,
        "Z-Stream User",
      );
      return register({
        credentialId: passkey.id,
        userData: {
          device,
          profile: accountProfile,
        },
      });
    },
    [backendUrl, register],
  );

  const loginWithPasskey = useCallback(
    async (device: string) => {
      if (!backendUrl) return;
      const assertion = await authenticatePasskey();
      return login({
        credentialId: assertion.id,
        userData: { device },
      });
    },
    [backendUrl, login],
  );

  const migrateToPassword = useCallback(
    async (username: string, password: string) => {
      if (!backendUrl || !currentAccount) return;
      await migrateToPasswordRequest(
        backendUrl,
        currentAccount,
        username,
        password,
      );
    },
    [backendUrl, currentAccount],
  );

  const addPassword = useCallback(
    async (username: string, password: string) => {
      if (!backendUrl || !currentAccount) return;
      await addPasswordRequest(backendUrl, currentAccount, username, password);
    },
    [backendUrl, currentAccount],
  );

  const addPasskey = useCallback(
    async (_device: string) => {
      if (!backendUrl || !currentAccount) return;
      const passkey = await createPasskey(
        `user-${Date.now()}`,
        "Z-Stream User",
      );
      const keys = await keysFromCredentialId(passkey.id);
      const publicKeyBase64Url = bytesToBase64Url(keys.publicKey);
      storeCredentialMapping(backendUrl, publicKeyBase64Url, passkey.id);
    },
    [backendUrl, currentAccount],
  );

  const importData = useCallback(
    async (
      account: AccountWithToken,
      progressItems: Record<string, ProgressMediaItem>,
      bookmarks: Record<string, BookmarkMediaItem>,
      watchHistoryItems: Record<string, WatchHistoryItem> = {},
      // Only seed the account with this device's local preferences when
      // creating/migrating an account. On a plain login the account may
      // already have its own configured settings elsewhere -- don't clobber
      // them with whatever this device happens to have locally.
      pushSettings = true,
    ) => {
      if (!backendUrl) return;

      const progressInputs = Object.entries(progressItems).flatMap(
        ([tmdbId, item]) => progressMediaItemToInputs(tmdbId, item),
      );
      const watchHistoryInputs = watchHistoryItemsToInputs(watchHistoryItems);
      const bookmarkInputs = Object.entries(bookmarks).map(([tmdbId, item]) =>
        bookmarkMediaToInput(tmdbId, item),
      );

      await importAllUserData(backendUrl, account, {
        progressInputs,
        watchHistoryInputs,
        bookmarkInputs,
        groupOrder,
        settings: pushSettings
          ? buildFullSettingsInput(preferences, {
              applicationLanguage,
              applicationTheme: applicationTheme ?? undefined,
              defaultSubtitleLanguage: subtitleLanguage || undefined,
            })
          : undefined,
      });
    },
    [
      backendUrl,
      groupOrder,
      preferences,
      subtitleLanguage,
      applicationLanguage,
      applicationTheme,
    ],
  );

  const restore = useCallback(
    async (account: AccountWithToken) => {
      if (!backendUrl) return;
      let user: { user: UserResponse; session: SessionResponse };
      try {
        user = await getUserWithRetry(backendUrl, account.token);
      } catch (err) {
        const anyError: any = err;
        if (anyError?.response?.status === 401) {
          await logout();
          return;
        }
        // Ambiguous/transient failure (network error, or a 400/403 that
        // persisted through retries) - don't destroy the local session on a
        // guess. Leave state untouched; the next scheduled check or page
        // load gets another chance to validate for real.
        console.error(err);
        return;
      }

      const [bookmarksPage, progressPage, watchHistory, settings, remoteGroupOrder] =
        await Promise.all([
          getBookmarksPage(backendUrl, account, { limit: RESTORE_FIRST_PAGE_SIZE }),
          getProgressPage(backendUrl, account, { limit: RESTORE_FIRST_PAGE_SIZE }),
          getWatchHistory(backendUrl, account),
          getSettings(backendUrl, account),
          getGroupOrder(backendUrl, account),
        ]);

      // Update account store with fresh user data (including nickname)
      const { setAccount } = useAuthStore.getState();
      if (account) {
        setAccount({
          ...account,
          nickname: user.user.nickname,
          profile: user.user.profile,
        });
      }

      syncData(
        user.user,
        user.session,
        progressPage.items,
        bookmarksPage.items,
        watchHistory,
        settings,
        remoteGroupOrder,
      );

      loadRemainingProgress(backendUrl, account, progressPage.nextCursor);
      loadRemainingBookmarks(backendUrl, account, bookmarksPage.nextCursor);
    },
    [backendUrl, syncData, logout],
  );

  return {
    loggedIn,
    profile,
    login,
    logout,
    disconnectFromBackend,
    register,
    registerWithPassword,
    loginWithPassword,
    registerWithPasskey,
    loginWithPasskey,
    migrateToPassword,
    addPassword,
    addPasskey,
    restore,
    importData,
  };
}
