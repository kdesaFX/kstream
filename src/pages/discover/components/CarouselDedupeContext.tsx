import {
  createContext,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

interface ClaimableMedia {
  id: string | number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  vote_count?: number;
}

interface CarouselDedupeContextValue {
  /**
   * Claim media for a carousel by TMDB id and by title+year. Lower priority
   * wins. Returns the IDs this carousel may display. Filtering is
   * synchronous — no version bump / re-render storms.
   */
  claim: (priority: number, items: ClaimableMedia[]) => string[];
}

const CarouselDedupeContext = createContext<CarouselDedupeContextValue | null>(
  null,
);

function yearFromDate(date?: string): string {
  if (!date || date.length < 4) return "";
  return date.slice(0, 4);
}

/** Normalize "The Odyssey" / "the  odyssey" → stable collision key with year. */
export function mediaTitleKey(item: ClaimableMedia): string | null {
  const raw = (item.title || item.name || "").trim().toLowerCase();
  if (!raw) return null;
  const year =
    yearFromDate(item.release_date) || yearFromDate(item.first_air_date);
  if (!year) return null;
  return `${raw.replace(/\s+/g, " ")}|${year}`;
}

/**
 * Within one list, keep a single entry per title+year — prefer the higher
 * vote count (drops low-quality TMDB stubs that share a blockbuster's name).
 */
export function collapseTitleYearDuplicates<T extends ClaimableMedia>(
  media: T[],
): T[] {
  const best = new Map<string, T>();
  const order: string[] = [];
  const passthrough: T[] = [];

  for (const item of media) {
    const key = mediaTitleKey(item);
    if (!key) {
      passthrough.push(item);
      continue;
    }
    const existing = best.get(key);
    if (!existing) {
      best.set(key, item);
      order.push(key);
      continue;
    }
    const existingVotes = existing.vote_count ?? 0;
    const nextVotes = item.vote_count ?? 0;
    if (nextVotes > existingVotes) best.set(key, item);
  }

  return [...order.map((k) => best.get(k)!), ...passthrough];
}

/**
 * First-come (by priority) wins: earlier rows keep a title, later rows drop
 * it so the page shows more unique posters. Claims both TMDB id and
 * title+year so duplicate stubs of the same film cannot reappear.
 */
export function CarouselDedupeProvider({ children }: { children: ReactNode }) {
  const claimedIdsRef = useRef(new Map<string, number>());
  const claimedTitlesRef = useRef(new Map<string, number>());

  const value = useMemo<CarouselDedupeContextValue>(
    () => ({
      claim(priority, items) {
        const claimedIds = claimedIdsRef.current;
        const claimedTitles = claimedTitlesRef.current;
        const idSet = new Set(items.map((m) => String(m.id)));
        const titleSet = new Set(
          items.map(mediaTitleKey).filter((k): k is string => Boolean(k)),
        );

        if (items.length > 0) {
          for (const [id, owner] of claimedIds) {
            if (owner === priority && !idSet.has(id)) claimedIds.delete(id);
          }
          for (const [title, owner] of claimedTitles) {
            if (owner === priority && !titleSet.has(title))
              claimedTitles.delete(title);
          }
        }

        const kept: string[] = [];
        for (const item of items) {
          const id = String(item.id);
          const titleKey = mediaTitleKey(item);

          const idOwner = claimedIds.get(id);
          const titleOwner = titleKey
            ? claimedTitles.get(titleKey)
            : undefined;

          const idTaken =
            idOwner !== undefined && idOwner !== priority && idOwner < priority;
          const titleTaken =
            titleOwner !== undefined &&
            titleOwner !== priority &&
            titleOwner < priority;

          if (idTaken || titleTaken) continue;

          claimedIds.set(id, priority);
          if (titleKey) claimedTitles.set(titleKey, priority);
          kept.push(id);
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
 * Filter a media list so titles already claimed by an earlier carousel are
 * removed. Collapses same-title stubs inside the list first. No-ops outside
 * a provider.
 */
export function useDedupedMedia<T extends ClaimableMedia>(
  priority: number | undefined,
  media: T[],
): T[] {
  const ctx = useContext(CarouselDedupeContext);

  return useMemo(() => {
    const collapsed = collapseTitleYearDuplicates(media);
    if (priority === undefined || !ctx) return collapsed;
    if (collapsed.length === 0) return collapsed;
    const kept = new Set(ctx.claim(priority, collapsed));
    return collapsed.filter((m) => kept.has(String(m.id)));
  }, [media, priority, ctx]);
}
