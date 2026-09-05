import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface ClaimableMedia {
  id: string | number;
  title?: string;
  name?: string;
  release_date?: string | Date;
  first_air_date?: string;
  year?: number;
  vote_count?: number;
}

interface CarouselDedupeContextValue {
  /**
   * Claim media for a carousel by TMDB id and by title(+year). Lower
   * priority wins. When the map changes, `version` bumps so siblings
   * re-filter (fixes lazy-load / async backfill races).
   */
  claim: (priority: number, items: ClaimableMedia[]) => string[];
  version: number;
}

const CarouselDedupeContext = createContext<CarouselDedupeContextValue | null>(
  null,
);

function yearFromDate(date?: string | Date): string {
  if (!date) return "";
  if (date instanceof Date) {
    const year = date.getFullYear();
    return Number.isFinite(year) && year > 0 ? String(year) : "";
  }
  if (date.length < 4) return "";
  return date.slice(0, 4);
}

function normalizeTitle(item: ClaimableMedia): string | null {
  const raw = (item.title || item.name || "").trim().toLowerCase();
  if (!raw) return null;
  return raw.replace(/\s+/g, " ");
}

/** Normalize "The Odyssey" / "the  odyssey" → stable collision key with year. */
export function mediaTitleKey(item: ClaimableMedia): string | null {
  const title = normalizeTitle(item);
  if (!title) return null;
  const year =
    yearFromDate(item.release_date) ||
    yearFromDate(item.first_air_date) ||
    (item.year != null && item.year > 0 ? String(item.year) : "");
  // Year when known (remakes). Never use bare `title|` — that flips to
  // `title|2020` when metadata gains a date and was thrashing claim→setVersion
  // into React error #185 (max update depth) on hard refresh.
  if (year) return `${title}|${year}`;
  return `${title}|#${String(item.id)}`;
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

function sameIdList<T extends ClaimableMedia>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (String(a[i]!.id) !== String(b[i]!.id)) return false;
  }
  return true;
}

/**
 * First-come (by priority) wins: earlier rows keep a title, later rows drop
 * it so the page shows more unique posters.
 */
export function CarouselDedupeProvider({ children }: { children: ReactNode }) {
  const claimedIdsRef = useRef(new Map<string, number>());
  const claimedTitlesRef = useRef(new Map<string, number>());
  const [version, setVersion] = useState(0);
  const pendingNotifyRef = useRef(false);
  const lastSnapshotRef = useRef("");
  /** Snapshots already notified — stops A↔B claim oscillation (#185). */
  const recentSnapshotsRef = useRef<string[]>([]);
  const notifyScheduledRef = useRef(false);

  const scheduleNotify = () => {
    if (notifyScheduledRef.current) return;
    notifyScheduledRef.current = true;
    queueMicrotask(() => {
      notifyScheduledRef.current = false;
      if (!pendingNotifyRef.current) return;
      pendingNotifyRef.current = false;
      setVersion((v) => v + 1);
    });
  };

  const value = useMemo<CarouselDedupeContextValue>(
    () => ({
      version,
      claim(priority, items) {
        const claimedIds = claimedIdsRef.current;
        const claimedTitles = claimedTitlesRef.current;
        const idSet = new Set(items.map((m) => String(m.id)));
        const titleSet = new Set(
          items.map(mediaTitleKey).filter((k): k is string => Boolean(k)),
        );

        let changed = false;

        if (items.length > 0) {
          for (const [id, owner] of [...claimedIds]) {
            if (owner === priority && !idSet.has(id)) {
              claimedIds.delete(id);
              changed = true;
            }
          }
          for (const [title, owner] of [...claimedTitles]) {
            if (owner === priority && !titleSet.has(title)) {
              claimedTitles.delete(title);
              changed = true;
            }
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

          if (claimedIds.get(id) !== priority) changed = true;
          claimedIds.set(id, priority);
          if (titleKey) {
            if (claimedTitles.get(titleKey) !== priority) changed = true;
            claimedTitles.set(titleKey, priority);
          }
          kept.push(id);
        }

        if (changed) {
          const snapshot = [
            [...claimedIds.entries()]
              .map(([id, owner]) => `${id}:${owner}`)
              .sort()
              .join(","),
            [...claimedTitles.entries()]
              .map(([title, owner]) => `${title}:${owner}`)
              .sort()
              .join(","),
          ].join("||");
          if (snapshot !== lastSnapshotRef.current) {
            // If we already notified for this ownership map, a second trip
            // here is an oscillation — do not bump version again.
            if (recentSnapshotsRef.current.includes(snapshot)) {
              lastSnapshotRef.current = snapshot;
              return kept;
            }
            lastSnapshotRef.current = snapshot;
            recentSnapshotsRef.current.push(snapshot);
            if (recentSnapshotsRef.current.length > 8) {
              recentSnapshotsRef.current.shift();
            }
            pendingNotifyRef.current = true;
            scheduleNotify();
          }
        }

        return kept;
      },
    }),
    [version],
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
 * a provider. Re-runs when `version` bumps after other rows claim.
 *
 * Claim runs in layout effect — never during render — so sibling setState
 * cannot nest into React error #185.
 */
export function useDedupedMedia<T extends ClaimableMedia>(
  priority: number | undefined,
  media: T[],
): T[] {
  const ctx = useContext(CarouselDedupeContext);
  const [filtered, setFiltered] = useState<T[]>(() =>
    collapseTitleYearDuplicates(media),
  );

  useLayoutEffect(() => {
    const collapsed = collapseTitleYearDuplicates(media);
    if (priority === undefined || !ctx) {
      setFiltered((prev) => (sameIdList(prev, collapsed) ? prev : collapsed));
      return;
    }
    if (collapsed.length === 0) {
      setFiltered((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    const kept = new Set(ctx.claim(priority, collapsed));
    const next = collapsed.filter((m) => kept.has(String(m.id)));
    setFiltered((prev) => (sameIdList(prev, next) ? prev : next));
  }, [media, priority, ctx, ctx?.version]);

  return filtered;
}
