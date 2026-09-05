import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export interface ClaimableMedia {
  id: string | number;
  title?: string;
  name?: string;
  release_date?: string | Date;
  first_air_date?: string;
  year?: number;
  vote_count?: number;
}

export interface CarouselClaimRow {
  priority: number;
  items: ClaimableMedia[];
}

interface CarouselDedupeContextValue {
  /** Register this row's current list; triggers at most one global recompute. */
  register: (priority: number, items: ClaimableMedia[]) => void;
  /** Drop a row from the registry (unmount / priority change). */
  unregister: (priority: number) => void;
  /** Pure assignment result: priority → kept ids. */
  assignments: Map<number, string[]>;
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

export function sameIdList<T extends ClaimableMedia>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (String(a[i]!.id) !== String(b[i]!.id)) return false;
  }
  return true;
}

function rowFingerprint(items: ClaimableMedia[]): string {
  return items
    .map((m) => `${String(m.id)}:${mediaTitleKey(m) ?? ""}`)
    .join(",");
}

function assignmentsFingerprint(map: Map<number, string[]>): string {
  return [...map.entries()]
    .map(([priority, ids]) => `${priority}:${ids.join(",")}`)
    .sort()
    .join("|");
}

/**
 * Pure multi-row assignment: lower priority number wins id + title keys.
 * Empty rows keep nothing (and therefore release prior ownership on recompute).
 * No React — safe to unit-test and impossible to infinite-loop by itself.
 */
export function assignCarouselClaims(
  rows: CarouselClaimRow[],
): Map<number, string[]> {
  const sorted = [...rows].sort((a, b) => a.priority - b.priority);
  const claimedIds = new Set<string>();
  const claimedTitles = new Set<string>();
  const result = new Map<number, string[]>();

  for (const row of sorted) {
    const collapsed = collapseTitleYearDuplicates(row.items);
    const kept: string[] = [];
    for (const item of collapsed) {
      const id = String(item.id);
      const titleKey = mediaTitleKey(item);
      if (claimedIds.has(id)) continue;
      if (titleKey && claimedTitles.has(titleKey)) continue;
      claimedIds.add(id);
      if (titleKey) claimedTitles.add(titleKey);
      kept.push(id);
    }
    result.set(row.priority, kept);
  }

  return result;
}

/**
 * Registry + one recompute. Children register lists; ownership is computed
 * once from all rows — never claim→version→reclaim (React #185).
 */
export function CarouselDedupeProvider({ children }: { children: ReactNode }) {
  const registryRef = useRef(new Map<number, ClaimableMedia[]>());
  const fingerprintsRef = useRef(new Map<number, string>());
  const lastAssignmentsFpRef = useRef("");
  const scheduledRef = useRef(false);
  const [assignments, setAssignments] = useState<Map<number, string[]>>(
    () => new Map(),
  );

  const scheduleRecompute = useCallback(() => {
    if (scheduledRef.current) return;
    scheduledRef.current = true;
    queueMicrotask(() => {
      scheduledRef.current = false;
      const rows: CarouselClaimRow[] = [...registryRef.current.entries()].map(
        ([priority, items]) => ({ priority, items }),
      );
      const next = assignCarouselClaims(rows);
      const fp = assignmentsFingerprint(next);
      if (fp === lastAssignmentsFpRef.current) return;
      lastAssignmentsFpRef.current = fp;
      setAssignments(next);
    });
  }, []);

  const register = useCallback(
    (priority: number, items: ClaimableMedia[]) => {
      const fp = rowFingerprint(items);
      if (fingerprintsRef.current.get(priority) === fp) return;
      fingerprintsRef.current.set(priority, fp);
      registryRef.current.set(priority, items);
      scheduleRecompute();
    },
    [scheduleRecompute],
  );

  const unregister = useCallback(
    (priority: number) => {
      if (!registryRef.current.has(priority)) return;
      registryRef.current.delete(priority);
      fingerprintsRef.current.delete(priority);
      scheduleRecompute();
    },
    [scheduleRecompute],
  );

  const value = useMemo<CarouselDedupeContextValue>(
    () => ({
      assignments,
      register,
      unregister,
    }),
    [assignments, register, unregister],
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
 *
 * Registers with the provider; reads a pure assignment map — never mutates
 * shared ownership during render or effects.
 */
export function useDedupedMedia<T extends ClaimableMedia>(
  priority: number | undefined,
  media: T[],
): T[] {
  const ctx = useContext(CarouselDedupeContext);
  const register = ctx?.register;
  const unregister = ctx?.unregister;
  const assignments = ctx?.assignments;

  const collapsed = useMemo(
    () => collapseTitleYearDuplicates(media),
    [media],
  );

  // Register on input change; do not unregister here (avoids empty-gap
  // recompute when only the list contents change).
  useLayoutEffect(() => {
    if (priority === undefined || !register) return undefined;
    register(priority, collapsed);
    return undefined;
  }, [priority, collapsed, register]);

  // Unregister only when this priority leaves the tree.
  useLayoutEffect(() => {
    if (priority === undefined || !unregister) return undefined;
    const p = priority;
    return () => {
      unregister(p);
    };
  }, [priority, unregister]);

  if (priority === undefined || !assignments) {
    return collapsed;
  }

  const kept = assignments.get(priority);
  if (!kept) {
    // First paint before microtask flush — show undeduped collapsed list.
    return collapsed;
  }

  const keptSet = new Set(kept);
  return collapsed.filter((m) => keptSet.has(String(m.id)));
}
