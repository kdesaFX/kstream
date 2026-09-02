import { getSupabase } from "@/backend/supabase/client";
import { isDesktopApp } from "@/hooks/useIsDesktopApp";

export const DESKTOP_OAUTH_REDIRECT = "kstream://auth/callback";

function desktopIpc() {
  if (typeof window === "undefined") return null;
  return window.__KSTREAM_DESKTOP_IPC__ ?? null;
}

export function canUseDesktopExternalOAuth(): boolean {
  return isDesktopApp() && Boolean(desktopIpc()?.invoke);
}

function isBlockedDesktopChannelError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes("Blocked desktop channel");
}

/**
 * Last-resort OAuth open for desktop builds whose preload has not allowlisted
 * openExternalAuth yet. Electron main-process guards intercept this navigation
 * and forward it to the system browser without loading OAuth in-app.
 *
 * Never call window.open here — on legacy builds it can spawn an in-app Google
 * window while openExternalAuth has already opened the system browser.
 */
function openOAuthViaNavigationGuard(oauthUrl: string): void {
  window.location.assign(oauthUrl);
}

export async function openDesktopOAuthInBrowser(oauthUrl: string): Promise<void> {
  const ipc = desktopIpc();
  if (!ipc) throw new Error("Desktop OAuth is unavailable");

  try {
    await ipc.invoke("openExternalAuth", { url: oauthUrl });
    return;
  } catch (err) {
    // Desktop builds before preload allowlisted openExternalAuth still route
    // OAuth URLs to the system browser via main-process navigation guards.
    if (!isBlockedDesktopChannelError(err)) throw err;
  }

  openOAuthViaNavigationGuard(oauthUrl);
}

/** Complete PKCE or implicit OAuth return from the system browser. */
export async function completeDesktopOAuthCallback(
  callbackUrl: string,
): Promise<void> {
  const sb = getSupabase();
  const parsed = new URL(callbackUrl);
  const code = parsed.searchParams.get("code");
  const authError =
    parsed.searchParams.get("error_description") ||
    parsed.searchParams.get("error");

  if (authError) {
    throw new Error(authError);
  }

  if (code) {
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return;
  }

  const hash = callbackUrl.includes("#")
    ? callbackUrl.slice(callbackUrl.indexOf("#") + 1)
    : "";
  const hashParams = new URLSearchParams(hash);
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");
  if (accessToken && refreshToken) {
    const { error } = await sb.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
    return;
  }

  throw new Error("OAuth callback did not include sign-in credentials");
}
