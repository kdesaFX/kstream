import {
  createContext,
  useContext,
  useEffect,
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

/**
 * Per-provider store living in a ref — not React state. Register/recompute
 * mutate this map; listeners apply local setState after setTimeout(0) so
 * Firefox cannot nest claim updates into React error #185.
 */
type DedupeStore = {
  registry: Map<number, ClaimableMedia[]>;
  fingerprints: Map<number, string>;
  assignments: Map<number, string[]>;
  assignmentsFp: string;
  listeners: Set<() => void>;
  notifyScheduled: boolean;
  recentNotifyAt: number[];
  frozen: boolean;
};

const NOTIFY_WINDOW_MS = 1000;
const NOTIFY_LIMIT = 25;

function createStore(): DedupeStore {
  return {
    registry: new Map(),
    fingerprints: new Map(),
    assignments: new Map(),
    assignmentsFp: "",
    listeners: new Set(),
    notifyScheduled: false,
    recentNotifyAt: [],
    frozen: false,
  };
}

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

function recomputeStore(store: DedupeStore): boolean {
  if (store.frozen) return false;
  const rows: CarouselClaimRow[] = [...store.registry.entries()].map(
    ([priority, items]) => ({ priority, items }),
  );
  const next = assignCarouselClaims(rows);
  const fp = assignmentsFingerprint(next);
  if (fp === store.assignmentsFp) return false;
  store.assignments = next;
  store.assignmentsFp = fp;
  return true;
}

function scheduleNotify(store: DedupeStore) {
  if (store.frozen || store.notifyScheduled) return;
  store.notifyScheduled = true;
  // Must leave the React commit/layout stack — queueMicrotask from
  // useLayoutEffect still counts toward max update depth on Firefox.
  window.setTimeout(() => {
    store.notifyScheduled = false;
    if (store.frozen) return;

    const now = Date.now();
    store.recentNotifyAt = store.recentNotifyAt.filter(
      (t) => now - t < NOTIFY_WINDOW_MS,
    );
    if (store.recentNotifyAt.length >= NOTIFY_LIMIT) {
      store.frozen = true;
      console.error(
        "Carousel dedupe circuit breaker tripped — freezing cross-row dedupe to prevent React #185",
      );
    }
    store.recentNotifyAt.push(now);
    store.listeners.forEach((listener) => listener());
  }, 0);
}

function storeRegister(
  store: DedupeStore,
  priority: number,
  items: ClaimableMedia[],
) {
  const fp = rowFingerprint(items);
  if (store.fingerprints.get(priority) === fp) return;
  store.fingerprints.set(priority, fp);
  store.registry.set(priority, items);
  if (recomputeStore(store)) scheduleNotify(store);
}

function storeUnregister(store: DedupeStore, priority: number) {
  if (!store.registry.has(priority)) return;
  store.registry.delete(priority);
  store.fingerprints.delete(priority);
  if (recomputeStore(store)) scheduleNotify(store);
}

function subscribeStore(store: DedupeStore, onStoreChange: () => void) {
  store.listeners.add(onStoreChange);
  return () => {
    store.listeners.delete(onStoreChange);
  };
}

function filterByAssignment<T extends ClaimableMedia>(
  collapsed: T[],
  kept: string[] | undefined,
  frozen: boolean,
): T[] {
  if (frozen || kept === undefined) return collapsed;
  const keptSet = new Set(kept);
  return collapsed.filter((m) => keptSet.has(String(m.id)));
}

interface CarouselDedupeContextValue {
  store: DedupeStore;
}

const CarouselDedupeContext = createContext<CarouselDedupeContextValue | null>(
  null,
);

/**
 * Provides a per-tree dedupe store. Ownership is not React state — children
 * keep local filtered lists and refresh after setTimeout notifies.
 */
export function CarouselDedupeProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<DedupeStore | null>(null);
  if (!storeRef.current) storeRef.current = createStore();
  const value = useMemo(() => ({ store: storeRef.current! }), []);
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
  const store = useContext(CarouselDedupeContext)?.store;

  const mediaFp = useMemo(() => rowFingerprint(media), [media]);
  const collapsed = useMemo(() => {
    return collapseTitleYearDuplicates(media);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mediaFp is the content key
  }, [mediaFp]);
  const collapsedRef = useRef(collapsed);
  collapsedRef.current = collapsed;

  const [filtered, setFiltered] = useState<T[]>(() =>
    collapseTitleYearDuplicates(media),
  );

  const applyAssignment = () => {
    if (priority === undefined || !store) {
      setFiltered((prev) =>
        sameIdList(prev, collapsedRef.current) ? prev : collapsedRef.current,
      );
      return;
    }
    const next = filterByAssignment(
      collapsedRef.current,
      store.assignments.get(priority),
      store.frozen,
    );
    setFiltered((prev) => (sameIdList(prev, next) ? prev : next));
  };

  useLayoutEffect(() => {
    if (priority === undefined || !store) {
      setFiltered((prev) => (sameIdList(prev, collapsed) ? prev : collapsed));
      return undefined;
    }
    storeRegister(store, priority, collapsed);
    // Apply immediately from sync recompute (sibling notify comes later).
    const next = filterByAssignment(
      collapsed,
      store.assignments.get(priority),
      store.frozen,
    );
    setFiltered((prev) => (sameIdList(prev, next) ? prev : next));
    return undefined;
  }, [priority, collapsed, store, mediaFp]);

  useLayoutEffect(() => {
    if (priority === undefined || !store) return undefined;
    const p = priority;
    const s = store;
    return () => {
      storeUnregister(s, p);
    };
  }, [priority, store]);

  useEffect(() => {
    if (priority === undefined || !store) return undefined;
    return subscribeStore(store, applyAssignment);
    // intentionally stable subscription per priority/store
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priority, store]);

  return filtered;
}
