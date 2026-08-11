import { useEffect, useRef } from "react";

import { updateGroupOrder } from "@/backend/accounts/groupOrder";
import { useBackendUrl } from "@/hooks/auth/useBackendUrl";
import { useAuthStore } from "@/stores/auth";
import { useGroupOrderStore } from "@/stores/groupOrder";

const SYNC_DEBOUNCE_MS = 1_500;

export function GroupSyncer() {
  const url = useBackendUrl();
  const groupOrder = useGroupOrderStore((s) => s.groupOrder);
  const lastSyncedOrder = useRef<string[]>([]);
  const isInitialized = useRef(false);

  // Initialize lastSyncedOrder on first render
  useEffect(() => {
    if (!isInitialized.current) {
      lastSyncedOrder.current = [...groupOrder];
      isInitialized.current = true;
    }
  }, [groupOrder]);

  // Sync only when order actually changes (debounced) — not on a forever poll.
  useEffect(() => {
    if (!isInitialized.current) return;
    if (!url) return;

    const hasChanged =
      JSON.stringify(groupOrder) !== JSON.stringify(lastSyncedOrder.current);
    if (!hasChanged) return;

    const timer = window.setTimeout(() => {
      void (async () => {
        const user = useAuthStore.getState();
        if (!user.account) return;

        const currentOrder = useGroupOrderStore.getState().groupOrder;
        if (
          JSON.stringify(currentOrder) ===
          JSON.stringify(lastSyncedOrder.current)
        ) {
          return;
        }

        try {
          await updateGroupOrder(url, user.account, currentOrder);
          lastSyncedOrder.current = [...currentOrder];
        } catch (err) {
          console.error("Failed to sync group order:", err);
        }
      })();
    }, SYNC_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [url, groupOrder]);

  return null;
}
