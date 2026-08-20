import { useEffect, useRef } from "react";

import {
  deleteRating,
  upsertAlgorithmPrefs,
  upsertRating,
} from "@/backend/supabase/data";
import { useBackendUrl } from "@/hooks/auth/useBackendUrl";
import { useAuthStore } from "@/stores/auth";
import { useRatingsStore } from "@/stores/ratings";

const syncIntervalMs = 5 * 1000;

export function RatingsSyncer() {
  const url = useBackendUrl();
  const prefsDirty = useRef(false);
  const ratingOps = useRef<Map<string, "upsert" | "delete">>(new Map());

  useEffect(() => {
    const originalToggle = useRatingsStore.getState().toggleRating;
    const originalRemove = useRatingsStore.getState().removeRating;
    const originalSetPrefs = useRatingsStore.getState().setPreferences;

    useRatingsStore.setState({
      toggleRating: (meta, rating) => {
        originalToggle(meta, rating);
        const current = useRatingsStore.getState().ratings[meta.tmdbId];
        if (current) {
          ratingOps.current.set(meta.tmdbId, "upsert");
        } else {
          ratingOps.current.set(meta.tmdbId, "delete");
        }
      },
      removeRating: (tmdbId) => {
        originalRemove(tmdbId);
        ratingOps.current.set(tmdbId, "delete");
      },
      setPreferences: (prefs) => {
        originalSetPrefs(prefs);
        prefsDirty.current = true;
      },
    });

    const flush = async () => {
      if (!url) return;
      const account = useAuthStore.getState().account;
      if (!account) return;

      const ops = [...ratingOps.current.entries()];
      ratingOps.current.clear();

      for (const [tmdbId, action] of ops) {
        try {
          if (action === "delete") {
            await deleteRating(account.userId, tmdbId);
            continue;
          }
          const item = useRatingsStore.getState().ratings[tmdbId];
          if (item) await upsertRating(account.userId, tmdbId, item);
        } catch (err) {
          console.error(`Failed to sync rating: ${tmdbId}`, err);
        }
      }

      if (prefsDirty.current) {
        prefsDirty.current = false;
        try {
          await upsertAlgorithmPrefs(
            account.userId,
            useRatingsStore.getState().preferences,
          );
        } catch (err) {
          console.error("Failed to sync algorithm preferences", err);
        }
      }
    };

    let syncTimeout: ReturnType<typeof setTimeout> | null = null;
    const debouncedFlush = () => {
      if (syncTimeout) clearTimeout(syncTimeout);
      syncTimeout = setTimeout(flush, 150);
    };

    const interval = setInterval(flush, syncIntervalMs);

    const unsub = useRatingsStore.subscribe(() => debouncedFlush());

    return () => {
      clearInterval(interval);
      if (syncTimeout) clearTimeout(syncTimeout);
      unsub();
    };
  }, [url]);

  return null;
}
