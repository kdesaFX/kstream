import {
  createContext,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

interface CarouselDedupeContextValue {
  /**
   * Claim media IDs for a carousel. Lower priority wins when two carousels
   * both have the same title. Returns the IDs this carousel may display.
   * Filtering is synchronous — no version bump / re-render storms.
   */
  claim: (priority: number, ids: string[]) => string[];
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

  const value = useMemo<CarouselDedupeContextValue>(
    () => ({
      claim(priority, ids) {
        const claimed = claimedRef.current;
        const idSet = new Set(ids);

        // Only release when this carousel still has items — never wipe
        // claims during a transient empty/loading flash (e.g. bookmark).
        if (ids.length > 0) {
          for (const [id, owner] of claimed) {
            if (owner === priority && !idSet.has(id)) {
              claimed.delete(id);
            }
          }
        }

        const kept: string[] = [];
        for (const id of ids) {
          const existing = claimed.get(id);
          if (existing === undefined || priority < existing) {
            claimed.set(id, priority);
            kept.push(id);
          } else if (existing === priority) {
            kept.push(id);
          }
        }
        return kept;
      },
    }),
    [],
  );

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

  return useMemo(() => {
    if (priority === undefined || !ctx) return media;
    // Empty lists keep previous claims (see claim()) so bookmark-driven
    // loading flashes don't hand titles to later rows.
    if (media.length === 0) return media;
    const kept = new Set(
      ctx.claim(
        priority,
        media.map((m) => String(m.id)),
      ),
    );
    return media.filter((m) => kept.has(String(m.id)));
  }, [media, priority, ctx]);
}
