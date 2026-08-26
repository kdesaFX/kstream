import { useEffect, useRef, useState } from "react";

import { isSupabaseConfigured } from "@/backend/supabase/client";
import { accountFromSession } from "@/backend/supabase/data";
import { useAuth } from "@/hooks/auth/useAuth";
import { useAuthStore } from "@/stores/auth";
import { runBootWarmup } from "@/setup/homeWarmup";

export function useAuthRestore() {
  const { account } = useAuthStore();
  const {
    restore,
    restoreFromSession,
    importLocalGuestLibraries,
    onAuthStateChange,
  } = useAuth();
  const hasRestored = useRef(false);
  const importingGuest = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(undefined);

  useEffect(() => {
    if (!isSupabaseConfigured()) return undefined;
    const sub = onAuthStateChange(async (event, session) => {
      if (!session) return;

      // Token refresh only needs a fresh access token — full restore caused
      // settings (devices list) to reload/flicker on every refresh.
      if (event === "TOKEN_REFRESHED") {
        const existing = useAuthStore.getState().account;
        if (existing) {
          useAuthStore.getState().setAccount({
            ...existing,
            token: session.access_token,
          });
        }
        return;
      }

      const acc = await accountFromSession(session);
      if (!acc) return;
      useAuthStore.getState().setAccount(acc);

      try {
        const { touchDevice } = await import("@/backend/supabase/data");
        await touchDevice(acc.userId);
      } catch {
        // Device tracking is best-effort
      }

      // Fresh sign-in (email/password or Google OAuth return): upload whatever
      // this browser watched/read as a guest before pulling cloud libraries.
      const shouldMergeGuest =
        event === "SIGNED_IN" ||
        (() => {
          try {
            return sessionStorage.getItem("kstream::merge-guest-on-auth") === "1";
          } catch {
            return false;
          }
        })();

      if (shouldMergeGuest && !importingGuest.current) {
        importingGuest.current = true;
        try {
          try {
            sessionStorage.removeItem("kstream::merge-guest-on-auth");
          } catch {
            // ignore
          }
          await importLocalGuestLibraries(acc, false);
        } catch (err) {
          console.error("Failed to import guest libraries on sign-in", err);
        } finally {
          importingGuest.current = false;
        }
      }

      await restore(acc);
    });
    return () => sub.unsubscribe();
  }, [onAuthStateChange, restore, importLocalGuestLibraries]);

  useEffect(() => {
    if (hasRestored.current) return;
    hasRestored.current = true;

    const accountAtBoot = useAuthStore.getState().account;

    (async () => {
      try {
        await runBootWarmup({
          authWork: async () => {
            if (!isSupabaseConfigured()) return;
            if (accountAtBoot) {
              await restore(accountAtBoot);
              return;
            }
            await restoreFromSession();
          },
        });
      } catch (err) {
        console.error("Boot warmup failed:", err);
        setError(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    loading,
    error,
    /** Prefer "Loading your profile" when an account was already persisted. */
    hasAccount: Boolean(account),
  };
}
