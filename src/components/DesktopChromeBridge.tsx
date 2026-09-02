import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  accountFromSession,
  getCurrentSession,
} from "@/backend/supabase/data";
import { completeDesktopOAuthCallback } from "@/backend/supabase/desktopOAuth";
import { useAuthStore } from "@/stores/auth";
import { playerStatus } from "@/stores/player/slices/source";
import { usePlayerStore } from "@/stores/player/store";

function pushPresence(body: Record<string, unknown>) {
  const ipc = window.__KSTREAM_DESKTOP_IPC__;
  if (!ipc?.invoke) return;
  void ipc.invoke("updateMediaMetadata", body).catch(() => {});
}

/**
 * Desktop-only: idle Discord presence on menus + pause when the window X is pressed.
 * Minimize must not pause (Electron fires minimize separately from close).
 */
export function DesktopChromeBridge() {
  const location = useLocation();
  const navigate = useNavigate();
  const isWatchPage = location.pathname.startsWith("/media/");

  useEffect(() => {
    if (!window.__KSTREAM_DESKTOP_IPC__?.invoke) return;
    if (isWatchPage) return;
    pushPresence({ idle: true });
  }, [isWatchPage, location.pathname]);

  useEffect(() => {
    const ipc = window.__KSTREAM_DESKTOP_IPC__;
    if (!ipc?.onPauseForClose) return;

    return ipc.onPauseForClose(() => {
      const state = usePlayerStore.getState();
      if (state.status !== playerStatus.PLAYING) return;
      if (state.mediaPlaying.isPaused) return;
      state.display?.pause();
    });
  }, []);

  useEffect(() => {
    const ipc = window.__KSTREAM_DESKTOP_IPC__;
    if (!ipc?.onOpenOffline) return;
    return ipc.onOpenOffline(() => {
      navigate("/offline");
    });
  }, [navigate]);

  useEffect(() => {
    const ipc = window.__KSTREAM_DESKTOP_IPC__;
    if (!ipc?.onAuthCallback) return;
    return ipc.onAuthCallback((callbackUrl) => {
      void (async () => {
        try {
          await completeDesktopOAuthCallback(callbackUrl);
          const session = await getCurrentSession();
          if (session) {
            const account = await accountFromSession(session);
            if (account) useAuthStore.getState().setAccount(account);
          }
          navigate("/", { replace: true });
        } catch (err) {
          console.error("[kstream] desktop OAuth callback failed", err);
        }
      })();
    });
  }, [navigate]);

  return null;
}
