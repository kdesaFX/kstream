import type { Session } from "@supabase/supabase-js";

import type { BookmarkInput } from "@/backend/accounts/bookmarks";
import type { GroupOrderResponse } from "@/backend/accounts/groupOrder";
import type { ProgressInput } from "@/backend/accounts/progress";
import type { SettingsInput, SettingsResponse } from "@/backend/accounts/settings";
import type {
  BookmarkResponse,
  ProgressResponse,
  UserEdit,
  UserResponse,
  WatchHistoryResponse,
} from "@/backend/accounts/user";
import type { WatchHistoryInput } from "@/backend/accounts/watchHistory";
import {
  canUseDesktopExternalOAuth,
  DESKTOP_OAUTH_REDIRECT,
  openDesktopOAuthInBrowser,
} from "@/backend/supabase/desktopOAuth";
import { getSupabase, tryGetSupabase } from "@/backend/supabase/client";
import { prepareAvatarImage } from "@/utils/avatarImage";
import {
  bookmarkInputToRow,
  bookmarkMediaToRow,
  bookmarkRowToResponse,
  groupOrderRowToResponse,
  mangaProgressToRow,
  progressPayloadToResponses,
  profileToUser,
  ratingToRow,
  settingsPayloadToResponse,
  watchHistoryPayloadToResponse,
  type ProfileRow,
} from "@/backend/supabase/mappers";
import type { AccountWithToken } from "@/stores/auth";
import type { BookmarkMediaItem } from "@/stores/bookmarks";
import type { MangaProgressItem } from "@/stores/mangaProgress";
import type { ProgressMediaItem } from "@/stores/progress";
import type { AlgorithmPreferences, RatedMediaItem } from "@/stores/ratings";
import type { WatchHistoryItem } from "@/stores/watchHistory";
import {
  getDeviceClientId,
  suggestDeviceName,
} from "@/utils/deviceClient";
import { getClientPlatform, isDesktopApp } from "@/hooks/useIsDesktopApp";

import { progressInputToMediaItem, mergeProgressPayload } from "./progressMerge";

export { profileToUser } from "@/backend/supabase/mappers";

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return null;
}

/** Discord OAuth sometimes still appends the legacy discriminator (`#0`). */
function stripDiscordDiscriminator(name: string): string {
  return name.replace(/#\d{1,4}$/, "").trim() || name;
}

function sessionHasProvider(session: Session, provider: string): boolean {
  const user = session.user;
  const providers = user.app_metadata?.providers as string[] | undefined;
  return Boolean(
    user.app_metadata?.provider === provider ||
      providers?.includes(provider) ||
      user.identities?.some((i) => i.provider === provider),
  );
}

/** Prefer OAuth display identity over email local-part (Discord username, etc.). */
function nicknameFromSession(session: Session): string {
  const user = session.user;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const customClaims = (meta.custom_claims ?? {}) as Record<string, unknown>;
  const discordIdentity = user.identities?.find((i) => i.provider === "discord");
  const discordData = (discordIdentity?.identity_data ?? {}) as Record<
    string,
    unknown
  >;

  if (sessionHasProvider(session, "discord")) {
    const discordName = firstNonEmptyString(
      // Discord username (not the email local-part)
      meta.preferred_username,
      meta.user_name,
      meta.name,
      discordData.preferred_username,
      discordData.user_name,
      discordData.name,
      // Fallbacks if username fields are missing
      customClaims.global_name,
      meta.full_name,
      discordData.full_name,
      discordData.global_name,
    );
    if (discordName) return stripDiscordDiscriminator(discordName);
  }

  if (sessionHasProvider(session, "google")) {
    const googleName = firstNonEmptyString(
      meta.full_name,
      meta.name,
      meta.preferred_username,
    );
    if (googleName) return googleName;
  }

  const fromSignupMeta = firstNonEmptyString(meta.nickname);
  if (fromSignupMeta) return fromSignupMeta;

  return user.email?.split("@")[0] ?? "User";
}

export async function fetchProfile(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await getSupabase()
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as ProfileRow | null;
}

export async function accountFromSession(session: Session): Promise<AccountWithToken | null> {
  if (!session.access_token || !session.user?.id) return null;
  let profile = await fetchProfile(session.user.id);
  const preferredNickname = nicknameFromSession(session);
  if (!profile) {
    const { error } = await getSupabase().from("profiles").insert({
      id: session.user.id,
      nickname: preferredNickname,
    });
    if (error) throw error;
    profile = await fetchProfile(session.user.id);
  } else if (
    sessionHasProvider(session, "discord") &&
    preferredNickname !== profile.nickname &&
    (profile.nickname === session.user.email?.split("@")[0] ||
      /#\d{1,4}$/.test(profile.nickname))
  ) {
    // One-time fix: email local-part nicknames, or leftover Discord `#0` tags.
    await getSupabase()
      .from("profiles")
      .update({ nickname: preferredNickname })
      .eq("id", session.user.id);
    profile = { ...profile, nickname: preferredNickname };
  }
  if (!profile) return null;
  // Register / refresh this browser under a stable client id so "This device"
  // on phone + desktop no longer collapses into a single row.
  const touched = await touchDevice(session.user.id, {
    deviceName:
      profile.device_name && !isGenericDeviceName(profile.device_name)
        ? profile.device_name
        : undefined,
  });
  return {
    token: session.access_token,
    userId: session.user.id,
    sessionId: touched.clientId,
    deviceName: touched.deviceName,
    profile: {
      colorA: profile.color_a,
      colorB: profile.color_b,
      icon: profile.icon,
      avatarUrl: profile.avatar_url ?? null,
    },
    nickname: profile.nickname,
  };
}

function isGenericDeviceName(name: string): boolean {
  return /^(this device|unknown device)$/i.test(name.trim());
}

/** Skip redundant last_seen writes — device list does not need second-level freshness. */
const TOUCH_DEVICE_MIN_INTERVAL_MS = 15 * 60 * 1000;
const touchDeviceLastAt = new Map<string, number>();
const touchDeviceNameCache = new Map<string, string>();

export async function touchDevice(
  userId: string,
  opts?: { deviceName?: string; clientId?: string; force?: boolean },
): Promise<{ clientId: string; deviceName: string }> {
  const clientId = opts?.clientId ?? getDeviceClientId();
  const userAgent =
    typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 512) : "";
  const platform = getClientPlatform();
  const cacheKey = `${userId}:${clientId}`;
  const now = Date.now();
  const lastAt = touchDeviceLastAt.get(cacheKey) ?? 0;
  const force = Boolean(opts?.force || opts?.deviceName?.trim());

  // Hot path: recently touched and no rename — zero network (was millions/day).
  if (!force && now - lastAt < TOUCH_DEVICE_MIN_INTERVAL_MS) {
    const cachedName = touchDeviceNameCache.get(cacheKey);
    if (cachedName) {
      return { clientId, deviceName: cachedName };
    }
  }

  const { data: existing, error: lookupError } = await getSupabase()
    .from("devices")
    .select("client_id, device_name")
    .eq("user_id", userId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (lookupError) throw lookupError;

  let deviceName =
    opts?.deviceName?.trim() ||
    (existing?.device_name && !isGenericDeviceName(existing.device_name)
      ? existing.device_name
      : null) ||
    suggestDeviceName(userAgent || undefined);

  if (existing && !force && now - lastAt < TOUCH_DEVICE_MIN_INTERVAL_MS) {
    touchDeviceNameCache.set(cacheKey, existing.device_name || deviceName);
    return { clientId, deviceName: existing.device_name || deviceName };
  }

  const lastSeen = new Date().toISOString();
  if (existing) {
    const { error } = await getSupabase()
      .from("devices")
      .update({
        device_name: deviceName,
        user_agent: userAgent || null,
        platform,
        last_seen: lastSeen,
      })
      .eq("user_id", userId)
      .eq("client_id", clientId);
    if (error) throw error;
  } else {
    const { error } = await getSupabase().from("devices").insert({
      user_id: userId,
      client_id: clientId,
      device_name: deviceName,
      user_agent: userAgent || null,
      platform,
      last_seen: lastSeen,
    });
    if (error) throw error;
  }

  touchDeviceLastAt.set(cacheKey, now);
  touchDeviceNameCache.set(cacheKey, deviceName);
  return { clientId, deviceName };
}

export async function updateProfile(
  userId: string,
  edit: UserEdit & { deviceName?: string },
): Promise<UserResponse> {
  const patch: Record<string, unknown> = {};
  if (edit.nickname != null) patch.nickname = edit.nickname;
  if (edit.profile) {
    patch.color_a = edit.profile.colorA;
    patch.color_b = edit.profile.colorB;
    patch.icon = edit.profile.icon;
    if (edit.profile.avatarUrl !== undefined) {
      patch.avatar_url = edit.profile.avatarUrl;
    }
  }
  if (edit.deviceName != null) patch.device_name = edit.deviceName;
  const { data, error } = await getSupabase()
    .from("profiles")
    .update(patch)
    .eq("id", userId)
    .select("*")
    .single();
  if (error) throw error;
  if (edit.deviceName) {
    await touchDevice(userId, { deviceName: edit.deviceName });
  }
  return profileToUser(data as ProfileRow);
}

export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const blob = await prepareAvatarImage(file);
  const path = `${userId}/avatar.jpg`;
  const { error } = await getSupabase()
    .storage
    .from("avatars")
    .upload(path, blob, {
      upsert: true,
      contentType: "image/jpeg",
      cacheControl: "3600",
    });
  if (error) throw error;
  const { data } = getSupabase().storage.from("avatars").getPublicUrl(path);
  const avatarUrl = `${data.publicUrl}?v=${Date.now()}`;
  const { error: updateError } = await getSupabase()
    .from("profiles")
    .update({ avatar_url: avatarUrl })
    .eq("id", userId);
  if (updateError) throw updateError;
  return avatarUrl;
}

export async function removeAvatar(userId: string) {
  await getSupabase().storage.from("avatars").remove([`${userId}/avatar.jpg`]);
  const { error } = await getSupabase()
    .from("profiles")
    .update({ avatar_url: null })
    .eq("id", userId);
  if (error) throw error;
}

export async function deleteAccount() {
  const { error } = await getSupabase().rpc("delete_own_account");
  if (error) throw error;
}

export async function fetchBookmarks(userId: string): Promise<BookmarkResponse[]> {
  const { data, error } = await getSupabase()
    .from("bookmarks")
    .select("*")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((row) => bookmarkRowToResponse(row as never));
}

export async function fetchBookmarksPage(
  userId: string,
  opts: { limit: number; cursor?: string },
): Promise<{ items: BookmarkResponse[]; nextCursor: string | null }> {
  const offset = opts.cursor ? Number(opts.cursor) : 0;
  const { data, error, count } = await getSupabase()
    .from("bookmarks")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .range(offset, offset + opts.limit - 1);
  if (error) throw error;
  const items = (data ?? []).map((row) => bookmarkRowToResponse(row as never));
  const next = count != null && offset + opts.limit < count ? String(offset + opts.limit) : null;
  return { items, nextCursor: next };
}

export async function upsertBookmark(userId: string, input: BookmarkInput) {
  const { error } = await getSupabase()
    .from("bookmarks")
    .upsert(bookmarkInputToRow(userId, input), { onConflict: "user_id,tmdb_id" });
  if (error) throw error;
}

export async function deleteBookmark(userId: string, tmdbId: string) {
  const { error } = await getSupabase()
    .from("bookmarks")
    .delete()
    .eq("user_id", userId)
    .eq("tmdb_id", tmdbId);
  if (error) throw error;
}

export async function fetchProgress(userId: string): Promise<ProgressResponse[]> {
  const { data, error } = await getSupabase()
    .from("progress")
    .select("*")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).flatMap((row) =>
    progressPayloadToResponses(row.tmdb_id, row.payload as ProgressMediaItem),
  );
}

export async function fetchProgressPage(
  userId: string,
  opts: { limit: number; cursor?: string },
): Promise<{ items: ProgressResponse[]; nextCursor: string | null }> {
  const offset = opts.cursor ? Number(opts.cursor) : 0;
  const { data, error, count } = await getSupabase()
    .from("progress")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .range(offset, offset + opts.limit - 1);
  if (error) throw error;
  const items = (data ?? []).flatMap((row) =>
    progressPayloadToResponses(row.tmdb_id, row.payload as ProgressMediaItem),
  );
  const next = count != null && offset + opts.limit < count ? String(offset + opts.limit) : null;
  return { items, nextCursor: next };
}

export async function upsertProgress(userId: string, input: ProgressInput) {
  const { data: existing } = await getSupabase()
    .from("progress")
    .select("payload")
    .eq("user_id", userId)
    .eq("tmdb_id", input.tmdbId)
    .maybeSingle();
  const merged = mergeProgressPayload(
    (existing?.payload as ProgressMediaItem | undefined) ?? null,
    progressInputToMediaItem(input),
    input,
  );
  const { error } = await getSupabase()
    .from("progress")
    .upsert(
      { user_id: userId, tmdb_id: input.tmdbId, payload: merged },
      { onConflict: "user_id,tmdb_id" },
    );
  if (error) throw error;
}

export async function deleteProgress(
  userId: string,
  tmdbId: string,
  episodeId?: string,
  seasonId?: string,
) {
  if (!episodeId && !seasonId) {
    const { error } = await getSupabase()
      .from("progress")
      .delete()
      .eq("user_id", userId)
      .eq("tmdb_id", tmdbId);
    if (error) throw error;
    return;
  }
  const { data: existing } = await getSupabase()
    .from("progress")
    .select("payload")
    .eq("user_id", userId)
    .eq("tmdb_id", tmdbId)
    .maybeSingle();
  const payload = existing?.payload as ProgressMediaItem | undefined;
  if (!payload || payload.type !== "show") return;
  if (episodeId) delete payload.episodes[episodeId];
  const remaining = Object.keys(payload.episodes).length;
  if (remaining === 0) {
    await getSupabase().from("progress").delete().eq("user_id", userId).eq("tmdb_id", tmdbId);
    return;
  }
  await getSupabase()
    .from("progress")
    .upsert({ user_id: userId, tmdb_id: tmdbId, payload }, { onConflict: "user_id,tmdb_id" });
}

export async function fetchWatchHistory(userId: string): Promise<WatchHistoryResponse[]> {
  const { data, error } = await getSupabase()
    .from("watch_history")
    .select("*")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((row) =>
    watchHistoryPayloadToResponse(row.entry_id, row.payload as WatchHistoryItem),
  );
}

export async function upsertWatchHistory(userId: string, input: WatchHistoryInput) {
  const entryId = input.episodeId
    ? `${input.tmdbId}-${input.episodeId}`
    : input.tmdbId;
  const payload: WatchHistoryItem = {
    type: input.meta?.type as "movie" | "show",
    title: input.meta?.title ?? "",
    poster: input.meta?.poster,
    year: input.meta?.year,
    progress: { duration: input.duration, watched: input.watched },
    watchedAt: new Date(input.watchedAt).getTime(),
    completed: input.completed,
    episodeId: input.episodeId,
    seasonId: input.seasonId,
    seasonNumber: input.seasonNumber,
    episodeNumber: input.episodeNumber,
  };
  const { error } = await getSupabase()
    .from("watch_history")
    .upsert({ user_id: userId, entry_id: entryId, payload }, { onConflict: "user_id,entry_id" });
  if (error) throw error;
}

export async function deleteWatchHistory(
  userId: string,
  id: string,
  episodeId?: string,
) {
  const entryId = episodeId ? `${id}-${episodeId}` : id;
  const { error } = await getSupabase()
    .from("watch_history")
    .delete()
    .eq("user_id", userId)
    .eq("entry_id", entryId);
  if (error) throw error;
}

export async function fetchSettings(userId: string): Promise<SettingsResponse> {
  const { data, error } = await getSupabase()
    .from("user_settings")
    .select("payload")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return settingsPayloadToResponse((data?.payload as Record<string, unknown>) ?? {});
}

export async function upsertSettings(userId: string, settings: SettingsInput) {
  const { data: existing } = await getSupabase()
    .from("user_settings")
    .select("payload")
    .eq("user_id", userId)
    .maybeSingle();
  const merged = { ...((existing?.payload as object) ?? {}), ...settings };
  const { error } = await getSupabase()
    .from("user_settings")
    .upsert({ user_id: userId, payload: merged }, { onConflict: "user_id" });
  if (error) throw error;
}

export async function fetchGroupOrder(userId: string): Promise<GroupOrderResponse> {
  const { data, error } = await getSupabase()
    .from("group_order")
    .select("groups")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return groupOrderRowToResponse({ groups: data?.groups ?? [] });
}

export async function upsertGroupOrder(userId: string, groups: string[]) {
  const { error } = await getSupabase()
    .from("group_order")
    .upsert({ user_id: userId, groups }, { onConflict: "user_id" });
  if (error) throw error;
}

export async function fetchMangaProgress(
  userId: string,
): Promise<Record<string, MangaProgressItem>> {
  const { data, error } = await getSupabase()
    .from("manga_progress")
    .select("*")
    .eq("user_id", userId);
  if (error) throw error;
  const out: Record<string, MangaProgressItem> = {};
  for (const row of data ?? []) {
    out[row.manga_id] = row.payload as MangaProgressItem;
  }
  return out;
}

export async function upsertMangaProgress(
  userId: string,
  mangaId: string,
  item: MangaProgressItem,
) {
  const { data: existing } = await getSupabase()
    .from("manga_progress")
    .select("payload")
    .eq("user_id", userId)
    .eq("manga_id", mangaId)
    .maybeSingle();
  const prev = existing?.payload as MangaProgressItem | undefined;
  // Keep whichever side was updated more recently so guest progress merges
  // into an existing account without clobbering cloud progress.
  const payload =
    !prev || (item.updatedAt ?? 0) >= (prev.updatedAt ?? 0) ? item : prev;
  const { error } = await getSupabase()
    .from("manga_progress")
    .upsert(mangaProgressToRow(userId, mangaId, payload), {
      onConflict: "user_id,manga_id",
    });
  if (error) throw error;
}

export async function deleteMangaProgress(userId: string, mangaId: string) {
  const { error } = await getSupabase()
    .from("manga_progress")
    .delete()
    .eq("user_id", userId)
    .eq("manga_id", mangaId);
  if (error) throw error;
}

export async function fetchRatings(userId: string): Promise<{
  ratings: Record<string, RatedMediaItem>;
  preferences: AlgorithmPreferences;
}> {
  const [ratingsRes, profile] = await Promise.all([
    getSupabase().from("ratings").select("*").eq("user_id", userId),
    fetchProfile(userId),
  ]);
  if (ratingsRes.error) throw ratingsRes.error;
  const ratings: Record<string, RatedMediaItem> = {};
  for (const row of ratingsRes.data ?? []) {
    ratings[row.tmdb_id] = row.payload as RatedMediaItem;
  }
  return {
    ratings,
    preferences: profile?.algorithm_prefs ?? {
      favoriteGenres: [],
      moods: [],
      franchises: [],
      completedOnboarding: false,
    },
  };
}

export async function upsertRating(userId: string, tmdbId: string, item: RatedMediaItem) {
  const { error } = await getSupabase()
    .from("ratings")
    .upsert(ratingToRow(userId, tmdbId, item), { onConflict: "user_id,tmdb_id" });
  if (error) throw error;
}

export async function deleteRating(userId: string, tmdbId: string) {
  const { error } = await getSupabase()
    .from("ratings")
    .delete()
    .eq("user_id", userId)
    .eq("tmdb_id", tmdbId);
  if (error) throw error;
}

export async function upsertAlgorithmPrefs(userId: string, prefs: AlgorithmPreferences) {
  const { error } = await getSupabase()
    .from("profiles")
    .update({ algorithm_prefs: prefs })
    .eq("id", userId);
  if (error) throw error;
}

export async function importBookmarksBulk(userId: string, inputs: BookmarkInput[]) {
  if (inputs.length === 0) return;
  const { error } = await getSupabase()
    .from("bookmarks")
    .upsert(inputs.map((input) => bookmarkInputToRow(userId, input)), {
      onConflict: "user_id,tmdb_id",
    });
  if (error) throw error;
}

export async function importProgressBulk(userId: string, inputs: ProgressInput[]) {
  for (const input of inputs) {
    // eslint-disable-next-line no-await-in-loop
    await upsertProgress(userId, input);
  }
}

export async function importWatchHistoryBulk(userId: string, inputs: WatchHistoryInput[]) {
  for (const input of inputs) {
    // eslint-disable-next-line no-await-in-loop
    await upsertWatchHistory(userId, input);
  }
}

export async function importMangaProgressBulk(
  userId: string,
  items: Record<string, MangaProgressItem>,
) {
  for (const [mangaId, item] of Object.entries(items)) {
    // eslint-disable-next-line no-await-in-loop
    await upsertMangaProgress(userId, mangaId, item);
  }
}

export async function importBookmarksFromStore(
  userId: string,
  bookmarks: Record<string, BookmarkMediaItem>,
) {
  const rows = Object.entries(bookmarks).map(([tmdbId, item]) =>
    bookmarkMediaToRow(userId, tmdbId, item),
  );
  if (rows.length === 0) return;
  const { error } = await getSupabase().from("bookmarks").upsert(rows, {
    onConflict: "user_id,tmdb_id",
  });
  if (error) throw error;
}

export async function fetchDevices(userId: string) {
  const { data, error } = await getSupabase()
    .from("devices")
    .select("client_id, device_name, user_agent, platform, last_seen")
    .eq("user_id", userId)
    .order("last_seen", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Array<{
    client_id: string;
    device_name: string;
    user_agent: string | null;
    platform: string | null;
    last_seen: string;
  }>;
}

export async function removeDevice(userId: string, clientId: string) {
  const { error } = await getSupabase()
    .from("devices")
    .delete()
    .eq("user_id", userId)
    .eq("client_id", clientId);
  if (error) throw error;
}

export async function getAuthProviderInfo(): Promise<{
  hasPassword: boolean;
  email: string | null;
  isGoogle: boolean;
  isDiscord: boolean;
}> {
  const { data } = await getSupabase().auth.getUser();
  const user = data.user;
  if (!user) {
    return {
      hasPassword: false,
      email: null,
      isGoogle: false,
      isDiscord: false,
    };
  }
  const providers = user.app_metadata?.providers as string[] | undefined;
  const hasProvider = (name: string) =>
    Boolean(
      user.app_metadata?.provider === name ||
        providers?.includes(name) ||
        user.identities?.some((i) => i.provider === name),
    );
  const isGoogle = hasProvider("google");
  const isDiscord = hasProvider("discord");
  return {
    hasPassword: !isGoogle && !isDiscord && Boolean(user.email),
    email: user.email ?? null,
    isGoogle,
    isDiscord,
  };
}

export async function changePassword(newPassword: string) {
  const { error } = await getSupabase().auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function signUpWithEmail(opts: {
  email: string;
  password: string;
  nickname: string;
  profile: { colorA: string; colorB: string; icon: string };
  deviceName: string;
}) {
  const { data, error } = await getSupabase().auth.signUp({
    email: opts.email,
    password: opts.password,
    options: {
      data: {
        nickname: opts.nickname,
        color_a: opts.profile.colorA,
        color_b: opts.profile.colorB,
        icon: opts.profile.icon,
      },
    },
  });
  if (error) throw error;
  if (!data.session?.user) {
    throw new Error("Check your email to confirm your account, then sign in.");
  }
  await updateProfile(data.session.user.id, {
    nickname: opts.nickname,
    profile: opts.profile,
    deviceName: opts.deviceName,
  });
  await touchDevice(data.session.user.id, { deviceName: opts.deviceName });
  return accountFromSession(data.session);
}

export async function signInWithEmail(email: string, password: string, deviceName: string) {
  const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data.session) throw new Error("Sign in failed");
  await updateProfile(data.session.user.id, { deviceName });
  await touchDevice(data.session.user.id, { deviceName });
  return accountFromSession(data.session);
}

async function signInWithOAuthProvider(provider: "google" | "discord") {
  // OAuth leaves this tab; flag so the return trip merges guest libraries.
  try {
    sessionStorage.setItem("kstream::merge-guest-on-auth", "1");
  } catch {
    // ignore storage failures
  }

  if (isDesktopApp()) {
    if (!canUseDesktopExternalOAuth()) {
      throw new Error(
        "Update the kstream desktop app to sign in with Google or Discord.",
      );
    }
    const { data, error } = await getSupabase().auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: DESKTOP_OAUTH_REDIRECT,
        skipBrowserRedirect: true,
      },
    });
    if (error) throw error;
    if (!data?.url) throw new Error("Could not start sign-in");
    await openDesktopOAuthInBrowser(data.url);
    return;
  }

  const redirectTo = `${window.location.origin}/`;
  const { error } = await getSupabase().auth.signInWithOAuth({
    provider,
    options: { redirectTo },
  });
  if (error) throw error;
}

export async function signInWithGoogle() {
  await signInWithOAuthProvider("google");
}

export async function signInWithDiscord() {
  await signInWithOAuthProvider("discord");
}

export async function signOut(scope: "local" | "global" = "local") {
  const { error } = await getSupabase().auth.signOut({ scope });
  if (error) throw error;
}

export async function getCurrentSession() {
  const sb = tryGetSupabase();
  if (!sb) return null;
  const { data, error } = await sb.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function onAuthStateChange(
  cb: (event: string, session: Session | null) => void,
) {
  const sb = tryGetSupabase();
  if (!sb) {
    return { unsubscribe() {} };
  }
  const { data } = sb.auth.onAuthStateChange((event, session) => {
    cb(event, session);
  });
  return data.subscription;
}
