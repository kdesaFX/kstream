import { useEffect, useState, type ReactNode } from "react";

type PersistApi = {
  hasHydrated: () => boolean;
  onFinishHydration: (cb: () => void) => () => void;
};

/**
 * True once a zustand `persist` store has rehydrated from localStorage.
 * First paint is often empty defaults — waiting avoids home rows popping in
 * under Discover and spiking CLS.
 */
export function usePersistedStoreHydrated(persist: PersistApi): boolean {
  const [hydrated, setHydrated] = useState(() => persist.hasHydrated());

  useEffect(() => {
    if (persist.hasHydrated()) {
      setHydrated(true);
      return undefined;
    }
    return persist.onFinishHydration(() => setHydrated(true));
  }, [persist]);

  return hydrated;
}

/** Sync peek — avoid reserving space when we already know the shelf is empty. */
export function peekPersistedHasItems(storageKey: string): boolean | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as {
      state?: {
        items?: Record<string, unknown>;
        bookmarks?: Record<string, unknown>;
      };
    };
    const items = parsed.state?.items ?? parsed.state?.bookmarks;
    if (!items || typeof items !== "object") return false;
    return Object.keys(items).length > 0;
  } catch {
    return null;
  }
}

/** Approx one continue-row + section heading — matches MediaGrid card row. */
export function HomeSectionHydrationPlaceholder() {
  return <div className="min-h-[18rem] w-full" aria-hidden />;
}

/** Placeholder only when localStorage suggests (or might have) items. */
export function homeSectionWhileHydrating(
  storageKey: string,
  hydrated: boolean,
): ReactNode | "ready" {
  if (hydrated) return "ready";
  const peek = peekPersistedHasItems(storageKey);
  if (peek === false) return null;
  return <HomeSectionHydrationPlaceholder />;
}
