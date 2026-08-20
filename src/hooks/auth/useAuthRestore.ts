import { useEffect, useRef } from "react";

import { accountFromSession } from "@/backend/supabase/data";
import { useAuth } from "@/hooks/auth/useAuth";
import { useAuthStore } from "@/stores/auth";

export function useAuthRestore() {
  const { account } = useAuthStore();
  const { restore, restoreFromSession, onAuthStateChange } = useAuth();
  const hasRestored = useRef(false);

  useEffect(() => {
    const sub = onAuthStateChange(async (session) => {
      if (session) {
        const acc = await accountFromSession(session);
        if (acc) {
          useAuthStore.getState().setAccount(acc);
          await restore(acc);
        }
      }
    });
    return () => sub.unsubscribe();
  }, [onAuthStateChange, restore]);

  useEffect(() => {
    if (hasRestored.current) return;
    hasRestored.current = true;
    (async () => {
      if (account) {
        await restore(account);
        return;
      }
      await restoreFromSession();
    })().catch(console.error);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { loading: false, error: undefined };
}
