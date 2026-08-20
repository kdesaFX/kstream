import { useEffect, useRef } from "react";

import { isSupabaseConfigured } from "@/backend/supabase/client";
import { accountFromSession } from "@/backend/supabase/data";
import { useAuth } from "@/hooks/auth/useAuth";
import { useAuthStore } from "@/stores/auth";

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

  useEffect(() => {
    if (!isSupabaseConfigured()) return undefined;
    const sub = onAuthStateChange(async (event, session) => {
      if (!session) return;
      const acc = await accountFromSession(session);
      if (!acc) return;
      useAuthStore.getState().setAccount(acc);

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
    (async () => {
      if (!isSupabaseConfigured()) return;
      if (account) {
        await restore(account);
        return;
      }
      await restoreFromSession();
    })().catch(console.error);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { loading: false, error: undefined };
}
