import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface CarouselDedupeContextValue {
  /**
   * Claim media IDs for a carousel. Lower priority wins when two carousels
   * both have the same title. Returns the IDs this carousel may display.
   */
  claim: (priority: number, ids: string[]) => string[];
  /** Bumps when claims change so consumers re-filter. */
  version: number;
}

const CarouselDedupeContext = createContext<CarouselDedupeContextValue | null>(
  null,
);

/**
 * First-come (by priority) wins: earlier rows keep a title, later rows drop
 * it so the page shows more unique posters.
 */
export function CarouselDedupeProvider({ children }: { children: ReactNode }) {
  const claimedRef = useRef(new Map<string, number>());
  const [version, setVersion] = useState(0);

  const claim = useCallback((priority: number, ids: string[]) => {
    const claimed = claimedRef.current;
    const idSet = new Set(ids);
    let changed = false;

    // Release IDs this priority no longer wants
    for (const [id, owner] of claimed) {
      if (owner === priority && !idSet.has(id)) {
        claimed.delete(id);
        changed = true;
      }
    }

    const kept: string[] = [];
    for (const id of ids) {
      const existing = claimed.get(id);
      if (existing === undefined || priority < existing) {
        if (existing !== priority) changed = true;
        claimed.set(id, priority);
        kept.push(id);
      } else if (existing === priority) {
        kept.push(id);
      }
    }

    if (changed) setVersion((v) => v + 1);
    return kept;
  }, []);

  const value = useMemo(() => ({ claim, version }), [claim, version]);

  return (
    <CarouselDedupeContext.Provider value={value}>
      {children}
    </CarouselDedupeContext.Provider>
  );
}

/**
 * Filter a media list so titles already shown in a higher-priority
 * (earlier) carousel are removed. No-ops when outside a provider.
 */
export function useDedupedMedia<T extends { id: string | number }>(
  priority: number | undefined,
  media: T[],
): T[] {
  const ctx = useContext(CarouselDedupeContext);
  const [keptIds, setKeptIds] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (priority === undefined || !ctx) {
      setKeptIds(null);
      return;
    }
    const kept = ctx.claim(
      priority,
      media.map((m) => String(m.id)),
    );
    setKeptIds(new Set(kept));
  }, [media, priority, ctx, ctx?.version]);

  return useMemo(() => {
    if (priority === undefined || !ctx || !keptIds) return media;
    return media.filter((m) => keptIds.has(String(m.id)));
  }, [media, priority, ctx, keptIds]);
}
