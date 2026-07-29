import { useCallback, useEffect, useRef, useState } from "react";
import { useInterval } from "react-use";

import { getPosterForMedia } from "@/backend/metadata/tmdb";
import { useBookmarkStore } from "@/stores/bookmarks";
import { useTraktAuthStore } from "@/stores/trakt/store";
import { traktService } from "@/utils/services/trakt";
import {
  TraktContentData,
  TraktWatchlistItem,
} from "@/utils/services/traktTypes";

const TRAKT_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const INITIAL_SYNC_DELAY_MS = 2000;
const QUEUE_RETRY_DELAY_MS = 5000;
const MAX_PUSH_PER_CYCLE = 100;


export function TraktBookmarkSyncer() {
  const { traktUpdateQueue, removeTraktUpdateItem, replaceBookmarks } =
    useBookmarkStore();
  const { accessToken } = useTraktAuthStore();
  const isSyncingRef = useRef(false);
  const [hydrated, setHydrated] = useState(false);
  const [retryTrigger, setRetryTrigger] = useState(0);

  // Sync from Local to Trakt (only remove from queue after API success; retry on failure)
  useEffect(() => {
    if (!accessToken) return;

    let retryTimeoutId: ReturnType<typeof setTimeout> | undefined;

    const processQueue = async () => {
      const queue = [...traktUpdateQueue];
      if (queue.length === 0) return;

      for (const item of queue) {
        try {
          const contentData: TraktContentData = {
            title: item.title ?? "",
            year: item.year,
            tmdbId: item.tmdbId,
            type: (item.type === "movie" ? "movie" : "show") as
              | "movie"
              | "show"
              | "episode",
          };

          if (item.action === "add") {
            await traktService.addToWatchlist(contentData);
           
          } else if (item.action === "delete") {
            await traktService.removeFromWatchlist(contentData);
            // Collections sync disabled - bookmarks only sync to watchlist
            // if (hasLists && item.group?.length) {
            //   for (const groupName of item.group) {
            //     const list = await findListByName(slug!, groupName);
            //     if (list) {
            //       await traktService.removeFromList(slug!, listId(list), [
            //         contentData,
            //       ]);
            //     }
            //   }
            // }
          }

          removeTraktUpdateItem(item.id);
        } catch (error) {
          console.error("Failed to sync bookmark to Trakt", error);
          if (!retryTimeoutId) {
            retryTimeoutId = setTimeout(
              () => setRetryTrigger((n) => n + 1),
              QUEUE_RETRY_DELAY_MS,
            );
          }
        }
      }
    };

    processQueue();
    return () => {
      if (retryTimeoutId) clearTimeout(retryTimeoutId);
    };
  }, [accessToken, traktUpdateQueue, removeTraktUpdateItem, retryTrigger]);

  // Push local bookmarks not already on Trakt's watchlist (TODO implement collections/groups sync)
  const syncBookmarksToTrakt = useCallback(
    async (remoteTmdbIds: Set<string>) => {
      if (!accessToken) return;
      const bookmarks = useBookmarkStore.getState().bookmarks;
      let pushed = 0;

      for (const [tmdbId, b] of Object.entries(bookmarks)) {
        if (pushed >= MAX_PUSH_PER_CYCLE) break;
        if (remoteTmdbIds.has(tmdbId)) continue;
        try {
          const contentData: TraktContentData = {
            tmdbId,
            title: b.title,
            year: b.year,
            type: b.type === "movie" ? "movie" : "show",
          };
          await traktService.addToWatchlist(contentData);
          remoteTmdbIds.add(tmdbId);
          pushed += 1;
          // Collections sync disabled - bookmarks only sync to watchlist
          // if (b.group?.length) {
          //   for (const groupName of b.group) {
          //     const list = await ensureListExists(slug, groupName);
          //     if (list) {
          //       await traktService.addToList(slug, listId(list), [contentData]);
          //     }
          //   }
          // }
        } catch (err) {
          console.warn("Failed to push bookmark to Trakt:", tmdbId, err);
        }
      }
    },
    [accessToken],
  );

  const syncWatchlistFromTrakt = useCallback(
    async (watchlist: TraktWatchlistItem[]) => {
      if (!accessToken) return;
      const store = useBookmarkStore.getState();
      const merged = { ...store.bookmarks };

      for (const item of watchlist) {
        const type = item.movie ? "movie" : "show";
        const media = item.movie || item.show;
        if (!media) continue;

        const tmdbId = media.ids.tmdb?.toString();
        if (!tmdbId) continue;

        if (!merged[tmdbId]) {
          const poster = await getPosterForMedia(tmdbId, type);
          merged[tmdbId] = {
            type: type as "movie" | "show",
            title: media.title,
            year: media.year,
            poster,
            updatedAt: Date.now(),
          };
        }
      }

      replaceBookmarks(merged);

      // Collections sync disabled - only watchlist is synced, no Trakt lists
      // const slug = useTraktAuthStore.getState().user?.ids?.slug;
      // if (slug) {
      //   try {
      //     const lists = await traktService.getLists(slug);
      //     const currentBookmarks = useBookmarkStore.getState().bookmarks;
      //     let modifiedBookmarks = { ...currentBookmarks };

      //     for (const list of lists) {
      //       const listTitle = list.name;
      //       const items = await traktService.getListItems(slug, listId(list));
      //       for (const li of items) {
      //         const media = li.movie || li.show;
      //         if (!media?.ids?.tmdb) continue;

      //         const tmdbId = media.ids.tmdb.toString();
      //         const type = li.movie ? "movie" : "show";
      //         const bookmark = modifiedBookmarks[tmdbId];

      //         if (!bookmark) {
      //           const poster = await getPosterForMedia(tmdbId, type);
      //           modifiedBookmarks[tmdbId] = {
      //             type: type as "movie" | "show",
      //             title: media.title,
      //             year: media.year,
      //             poster,
      //             updatedAt: Date.now(),
      //             group: [listTitle],
      //           };
      //         } else {
      //           const groups = bookmark.group ?? [];
      //           if (!groups.includes(listTitle)) {
      //             const { modifiedBookmarks: next } = modifyBookmarks(
      //               modifiedBookmarks,
      //               [tmdbId],
      //               { addGroups: [listTitle] },
      //             );
      //             modifiedBookmarks = next;
      //           }
      //         }
      //       }
      //     }

      //     const hasNewBookmarks =
      //       Object.keys(modifiedBookmarks).length !==
      //       Object.keys(currentBookmarks).length;
      //     const hasGroupChanges = Object.keys(modifiedBookmarks).some(
      //       (id) =>
      //         JSON.stringify(modifiedBookmarks[id]?.group ?? []) !==
      //         JSON.stringify(currentBookmarks[id]?.group ?? []),
      //     );
      //     if (hasNewBookmarks || hasGroupChanges) {
      //       replaceBookmarks(modifiedBookmarks);
      //     }
      //   } catch (listError) {
      //     console.warn("Failed to sync Trakt lists (groups)", listError);
      //   }
      // }
    },
    [replaceBookmarks],
  );


  const fullSync = useCallback(async () => {
    if (!accessToken || isSyncingRef.current) return;
    isSyncingRef.current = true;
    try {
      if (!useTraktAuthStore.getState().user) {
        await traktService.getUserProfile();
      }
      const watchlist = await traktService.getWatchlist();
      const remoteTmdbIds = new Set(
        watchlist
          .map((item) => (item.movie || item.show)?.ids?.tmdb?.toString())
          .filter((id): id is string => !!id),
      );

      await syncBookmarksToTrakt(remoteTmdbIds);
      await syncWatchlistFromTrakt(watchlist);
    } catch (error) {
      console.error("Failed to sync Trakt watchlist", error);
    } finally {
      isSyncingRef.current = false;
    }
  }, [accessToken, syncBookmarksToTrakt, syncWatchlistFromTrakt]);

  // Wait for Trakt auth store to rehydrate from persist (accessToken may be null on first render)
  useEffect(() => {
    const check = () => {
      if (useTraktAuthStore.persist?.hasHydrated?.()) {
        setHydrated(true);
        return true;
      }
      return false;
    };
    if (check()) return;
    const unsub = useTraktAuthStore.persist?.onFinishHydration?.(() => {
      setHydrated(true);
    });
    const t = setTimeout(() => setHydrated(true), 500);
    return () => {
      unsub?.();
      clearTimeout(t);
    };
  }, []);

  // On mount (after hydration): full sync (push then pull)
  useEffect(() => {
    if (!hydrated || !accessToken) return;
    const t = setTimeout(fullSync, INITIAL_SYNC_DELAY_MS);
    return () => clearTimeout(t);
  }, [hydrated, accessToken, fullSync]);

  // Periodic full sync (pull + push)
  useInterval(fullSync, TRAKT_SYNC_INTERVAL_MS);

  return null;
}
