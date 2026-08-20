import { useEffect } from "react";

import {
  deleteMangaProgress,
  upsertMangaProgress,
} from "@/backend/supabase/data";
import { useBackendUrl } from "@/hooks/auth/useBackendUrl";
import { useAuthStore } from "@/stores/auth";
import { useMangaProgressStore } from "@/stores/mangaProgress";

const syncIntervalMs = 5 * 1000;

type PendingOp =
  | { action: "upsert"; mangaId: string }
  | { action: "delete"; mangaId: string };

async function flushMangaProgress(
  pending: PendingOp[],
  account: NonNullable<ReturnType<typeof useAuthStore.getState>["account"]>,
) {
  for (const op of pending) {
    try {
      if (op.action === "delete") {
        await deleteMangaProgress(account.userId, op.mangaId);
        continue;
      }
      const item = useMangaProgressStore.getState().items[op.mangaId];
      if (!item) continue;
      await upsertMangaProgress(account.userId, op.mangaId, item);
    } catch (err) {
      console.error(`Failed to sync manga progress: ${op.mangaId}`, err);
    }
  }
}

export function MangaProgressSyncer() {
  const url = useBackendUrl();

  useEffect(() => {
    const pending = new Map<string, PendingOp>();

    const queue = (op: PendingOp) => {
      pending.set(op.mangaId, op);
    };

    const originalUpdate = useMangaProgressStore.getState().updateProgress;
    const originalRemove = useMangaProgressStore.getState().removeItem;

    useMangaProgressStore.setState({
      updateProgress: (...args) => {
        originalUpdate(...args);
        queue({ action: "upsert", mangaId: args[0].mangaId });
      },
      removeItem: (mangaId) => {
        originalRemove(mangaId);
        queue({ action: "delete", mangaId });
      },
    });

    let syncTimeout: ReturnType<typeof setTimeout> | null = null;
    const debouncedFlush = () => {
      if (syncTimeout) clearTimeout(syncTimeout);
      syncTimeout = setTimeout(async () => {
        if (!url) return;
        const account = useAuthStore.getState().account;
        if (!account) return;
        const ops = [...pending.values()];
        pending.clear();
        await flushMangaProgress(ops, account);
      }, 150);
    };

    const interval = setInterval(async () => {
      if (!url) return;
      const account = useAuthStore.getState().account;
      if (!account || pending.size === 0) return;
      const ops = [...pending.values()];
      pending.clear();
      await flushMangaProgress(ops, account);
    }, syncIntervalMs);

    const unsub = useMangaProgressStore.subscribe((state, prev) => {
      if (state.items !== prev.items) debouncedFlush();
    });

    return () => {
      clearInterval(interval);
      if (syncTimeout) clearTimeout(syncTimeout);
      unsub();
    };
  }, [url]);

  return null;
}
