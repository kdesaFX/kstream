import { useEffect, useRef, useState } from "react";

import { isSupabaseConfigured } from "@/backend/supabase/client";
import { accountFromSession } from "@/backend/supabase/data";
import { useAuth } from "@/hooks/auth/useAuth";
import { useAuthStore } from "@/stores/auth";
import { runBootWarmup } from "@/setup/homeWarmup";

/**
 * Auth restore used to re-subscribe whenever `restore` / `importLocalGuestLibraries`
 * changed identity. Those callbacks depended on language/theme/groupOrder, which
 * `restore` itself writes — so every open tab ran an infinite INITIAL_SESSION →
 * full library pull loop and burned Supabase egress (millions of REST calls/day).
 */
export function useAuthRestore() {
  const { account } = useAuthStore();
  const {
    restore,
    restoreFromSession,
    importLocalGuestLibraries,
    onAuthStateChange,
  } = useAuth();

  const restoreRef = useRef(restore);
  const restoreFromSessionRef = useRef(restoreFromSession);
  const importGuestRef = useRef(importLocalGuestLibraries);
  restoreRef.current = restore;
  restoreFromSessionRef.current = restoreFromSession;
  importGuestRef.current = importLocalGuestLibraries;

  const hasBootstrapped = useRef(false);
  const cloudRestoreInFlight = useRef(false);
  const importingGuest = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(undefined);

  useEffect(() => {
    if (!isSupabaseConfigured()) return undefined;

    const sub = onAuthStateChange(async (event, session) => {
      if (!session) return;

      // Token refresh: swap JWT only. Never re-pull libraries / touch device.
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

      // Boot warmup already restores once. Re-handling INITIAL_SESSION here
      // re-subscribed in a loop and duplicated every table fetch.
      if (event === "INITIAL_SESSION") {
        return;
      }

      // USER_UPDATED / password changes etc. — keep session account fresh,
      // but do not dump progress/bookmarks again.
      if (event !== "SIGNED_IN") {
        try {
          const acc = await accountFromSession(session);
          if (acc) useAuthStore.getState().setAccount(acc);
        } catch {
          // best-effort
        }
        return;
      }

      if (cloudRestoreInFlight.current) return;
      cloudRestoreInFlight.current = true;
      try {
        const acc = await accountFromSession(session);
        if (!acc) return;
        useAuthStore.getState().setAccount(acc);

        const shouldMergeGuest = (() => {
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
            await importGuestRef.current(acc, false);
          } catch (err) {
            console.error("Failed to import guest libraries on sign-in", err);
          } finally {
            importingGuest.current = false;
          }
        }

        await restoreRef.current(acc);
      } finally {
        cloudRestoreInFlight.current = false;
      }
    });

    return () => sub.unsubscribe();
    // Subscribe once — callbacks are read from refs so identity churn cannot
    // re-fire INITIAL_SESSION / re-attach listeners.
  }, [onAuthStateChange]);

  useEffect(() => {
    if (hasBootstrapped.current) return;
    hasBootstrapped.current = true;

    const accountAtBoot = useAuthStore.getState().account;

    (async () => {
      try {
        await runBootWarmup({
          authWork: async () => {
            if (!isSupabaseConfigured()) return;
            if (accountAtBoot) {
              await restoreRef.current(accountAtBoot);
              return;
            }
            await restoreFromSessionRef.current();
          },
        });
      } catch (err) {
        console.error("Boot warmup failed:", err);
        setError(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return {
    loading,
    error,
    /** Prefer "Loading your profile" when an account was already persisted. */
    hasAccount: Boolean(account),
  };
}
