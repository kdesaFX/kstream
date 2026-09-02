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

/** Open OAuth in the system browser (Electron routes window.open the same way). */
function openOAuthInSystemBrowser(oauthUrl: string): void {
  const opened = window.open(oauthUrl, "_blank", "noopener,noreferrer");
  if (opened) return;

  const anchor = document.createElement("a");
  anchor.href = oauthUrl;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  // Electron auth navigation guards intercept top-level OAuth navigations and
  // hand them to the system browser when window.open is blocked.
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
    // OAuth URLs to the system browser via window.open handlers.
    if (!isBlockedDesktopChannelError(err)) throw err;
  }

  openOAuthInSystemBrowser(oauthUrl);
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
