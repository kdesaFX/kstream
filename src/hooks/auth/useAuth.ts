import { useCallback } from "react";

import { bookmarkMediaToInput } from "@/backend/accounts/bookmarks";
import { getGroupOrder } from "@/backend/accounts/groupOrder";
import { importAllUserData } from "@/backend/accounts/import";
import { progressMediaItemToInputs } from "@/backend/accounts/progress";
import { signOut as sbSignOut } from "@/backend/accounts/sessions";
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
import { isSupabaseConfigured } from "@/backend/supabase/client";
import {
  accountFromSession,
  fetchMangaProgress,
  fetchRatings,
  getCurrentSession,
  onAuthStateChange,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
} from "@/backend/supabase/data";
import { useAuthData } from "@/hooks/auth/useAuthData";
import { AccountWithToken, useAuthStore } from "@/stores/auth";
import { BookmarkMediaItem, useBookmarkStore } from "@/stores/bookmarks";
import { useGroupOrderStore } from "@/stores/groupOrder";
import { useLanguageStore } from "@/stores/language";
import { useMangaProgressStore } from "@/stores/mangaProgress";
import type { MangaProgressItem } from "@/stores/mangaProgress";
import { usePreferencesStore } from "@/stores/preferences";
import { ProgressMediaItem, useProgressStore } from "@/stores/progress";
import { useSubtitleStore } from "@/stores/subtitles";
import { useThemeStore } from "@/stores/theme";
import { useWatchHistoryStore, WatchHistoryItem } from "@/stores/watchHistory";

export interface RegistrationData {
  email: string;
  password: string;
  userData: {
    device: string;
    profile: {
      colorA: string;
      colorB: string;
      icon: string;
    };
    nickname?: string;
  };
}

export interface LoginData {
  email: string;
  password: string;
  userData: {
    device: string;
  };
}

const RESTORE_FIRST_PAGE_SIZE = 300;
const RESTORE_BACKGROUND_PAGE_SIZE = 500;

async function loadRemainingProgress(
  account: AccountWithToken,
  cursor: string | null,
) {
  let next = cursor;
  let accumulated = useProgressStore.getState().items;
  let changed = false;
  while (next) {
    try {
      const page = await getProgressPage("", account, {
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
    useProgressStore.getState().replaceItems(
      mergeProgressItems(useProgressStore.getState().items, accumulated),
    );
  }
}

async function loadRemainingBookmarks(
  account: AccountWithToken,
  cursor: string | null,
) {
  let next = cursor;
  let accumulated = useBookmarkStore.getState().bookmarks;
  let changed = false;
  while (next) {
    try {
      const page = await getBookmarksPage("", account, {
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
  const loggedIn = !!currentAccount;
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

  const finishLogin = useCallback(
    async (account: AccountWithToken) => {
      const session = await getCurrentSession();
      const user = await getUser("", account.token);
      await userDataLogin(
        { token: account.token, session: user.session },
        user.user,
        user.session,
      );
      return account;
    },
    [userDataLogin],
  );

  const register = useCallback(
    async (registerData: RegistrationData) => {
      const account = await signUpWithEmail({
        email: registerData.email,
        password: registerData.password,
        nickname:
          registerData.userData.nickname ??
          registerData.email.split("@")[0] ??
          "User",
        profile: registerData.userData.profile,
        deviceName: registerData.userData.device,
      });
      if (!account) throw new Error("Registration failed");
      return finishLogin(account);
    },
    [finishLogin],
  );

  const login = useCallback(
    async (loginData: LoginData) => {
      const account = await signInWithEmail(
        loginData.email,
        loginData.password,
        loginData.userData.device,
      );
      if (!account) throw new Error("Sign in failed");
      return finishLogin(account);
    },
    [finishLogin],
  );

  const loginWithGoogle = useCallback(async () => {
    await signInWithGoogle();
  }, []);

  const logout = useCallback(async () => {
    try {
      await sbSignOut("", currentAccount?.token ?? "", "local");
    } catch {
      // ignore
    }
    await userDataLogout();
  }, [userDataLogout, currentAccount?.token]);

  const signOutEverywhere = useCallback(async () => {
    const { signOut } = await import("@/backend/supabase/data");
    await signOut("global");
    await userDataLogout();
  }, [userDataLogout]);

  const disconnectFromBackend = useCallback(async () => {
    await logout();
  }, [logout]);

  const importData = useCallback(
    async (
      account: AccountWithToken,
      progressItems: Record<string, ProgressMediaItem>,
      bookmarks: Record<string, BookmarkMediaItem>,
      watchHistoryItems: Record<string, WatchHistoryItem> = {},
      pushSettings = true,
      mangaProgress: Record<string, MangaProgressItem> = {},
    ) => {
      const progressInputs = Object.entries(progressItems).flatMap(
        ([tmdbId, item]) => progressMediaItemToInputs(tmdbId, item),
      );
      const watchHistoryInputs = watchHistoryItemsToInputs(watchHistoryItems);
      const bookmarkInputs = Object.entries(bookmarks).map(([tmdbId, item]) =>
        bookmarkMediaToInput(tmdbId, item),
      );

      await importAllUserData("", account, {
        progressInputs,
        watchHistoryInputs,
        bookmarkInputs,
        groupOrder,
        mangaProgress,
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
      groupOrder,
      preferences,
      subtitleLanguage,
      applicationLanguage,
      applicationTheme,
    ],
  );

  /** Push whatever this browser watched/read as a guest into the account. */
  const importLocalGuestLibraries = useCallback(
    async (account: AccountWithToken, pushSettings = false) => {
      await importData(
        account,
        useProgressStore.getState().items,
        useBookmarkStore.getState().bookmarks,
        useWatchHistoryStore.getState().items,
        pushSettings,
        useMangaProgressStore.getState().items,
      );
    },
    [importData],
  );

  const restore = useCallback(
    async (account: AccountWithToken) => {
      if (!isSupabaseConfigured()) return;
      let user: { user: UserResponse; session: import("@/backend/accounts/auth").SessionResponse };
      try {
        user = await getUser("", account.token);
      } catch (err) {
        console.error(err);
        await logout();
        return;
      }

      const [
        bookmarksPage,
        progressPage,
        watchHistory,
        settings,
        remoteGroupOrder,
        mangaProgress,
        ratingsRemote,
      ] = await Promise.all([
        getBookmarksPage("", account, { limit: RESTORE_FIRST_PAGE_SIZE }),
        getProgressPage("", account, { limit: RESTORE_FIRST_PAGE_SIZE }),
        getWatchHistory("", account),
        getSettings("", account),
        getGroupOrder("", account),
        fetchMangaProgress(account.userId),
        fetchRatings(account.userId),
      ]);

      useAuthStore.getState().setAccount({
        ...account,
        nickname: user.user.nickname,
        profile: user.user.profile,
      });

      syncData(
        user.user,
        user.session,
        progressPage.items,
        bookmarksPage.items,
        watchHistory,
        settings,
        remoteGroupOrder,
        mangaProgress,
        ratingsRemote,
      );

      loadRemainingProgress(account, progressPage.nextCursor);
      loadRemainingBookmarks(account, bookmarksPage.nextCursor);
    },
    [syncData, logout],
  );

  const restoreFromSession = useCallback(async () => {
    const session = await getCurrentSession();
    if (!session) return null;
    const account = await accountFromSession(session);
    if (!account) return null;
    useAuthStore.getState().setAccount(account);
    await restore(account);
    return account;
  }, [restore]);

  return {
    loggedIn,
    profile,
    login,
    register,
    loginWithGoogle,
    logout,
    signOutEverywhere,
    disconnectFromBackend,
    restore,
    restoreFromSession,
    importData,
    importLocalGuestLibraries,
    onAuthStateChange,
  };
}
