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

export async function openDesktopOAuthInBrowser(oauthUrl: string): Promise<void> {
  const ipc = desktopIpc();
  if (!ipc) throw new Error("Desktop OAuth is unavailable");
  await ipc.invoke("openExternalAuth", { url: oauthUrl });
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
