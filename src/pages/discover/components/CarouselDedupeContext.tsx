import { useMemo, type ReactNode } from "react";

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

/**
 * Pure multi-row assignment (kept for tests / future non-reactive use).
 * Not wired into React — reactive claim/notify caused React #185.
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
 * Passthrough provider — cross-row reactive dedupe was removed because every
 * claim→notify→setState design nested into React #185 on Firefox discover.
 * Rows still collapse within-list duplicates via useDedupedMedia.
 */
export function CarouselDedupeProvider({ children }: { children: ReactNode }) {
  return children;
}

/**
 * Collapse same-title stubs inside this row only.
 * Pure useMemo — no effects, no setState, cannot cause React #185.
 */
export function useDedupedMedia<T extends ClaimableMedia>(
  _priority: number | undefined,
  media: T[],
): T[] {
  const mediaFp = useMemo(() => rowFingerprint(media), [media]);
  return useMemo(() => {
    return collapseTitleYearDuplicates(media);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mediaFp is the content key
  }, [mediaFp]);
}
