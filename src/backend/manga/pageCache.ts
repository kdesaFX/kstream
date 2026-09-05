// v4: cache entries are keyed by chapterId + chapter number so a stale
// by-number race can't leave vol/ch30 pages under a ch19 id forever.
const STORAGE_KEY = "__kstream:mangaPages:v4";
const TTL_MS = 24 * 60 * 60 * 1000;

type Entry = { at: number; pages: string[]; chapter?: string | null };
type Store = Record<string, Entry>;

function readStore(): Store {
  if (typeof sessionStorage === "undefined") return {};
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}") as Store;
  } catch {
    return {};
  }
}

function writeStore(store: Store): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* quota — ignore */
  }
}

function entryKey(chapterId: string, chapter?: string | null): string {
  const n = chapter?.trim();
  return n ? `${chapterId}#${n}` : chapterId;
}

export function readPersistedPageCache(
  chapterId: string,
  chapter?: string | null,
): string[] | null {
  const store = readStore();
  const keyed = store[entryKey(chapterId, chapter)];
  const legacy = store[chapterId];
  const entry = keyed ?? (chapter?.trim() ? null : legacy);
  if (!entry || Date.now() - entry.at > TTL_MS) return null;
  if (
    chapter?.trim() &&
    entry.chapter?.trim() &&
    entry.chapter.trim() !== chapter.trim()
  ) {
    return null;
  }
  return entry.pages.length > 0 ? entry.pages : null;
}

export function clearPersistedPageCache(chapterId: string): void {
  const store = readStore();
  let changed = false;
  for (const key of Object.keys(store)) {
    if (key === chapterId || key.startsWith(`${chapterId}#`)) {
      delete store[key];
      changed = true;
    }
  }
  if (changed) writeStore(store);
}

export function writePersistedPageCache(
  chapterId: string,
  pages: string[],
  chapter?: string | null,
): void {
  if (!pages.length) return;
  const store = readStore();
  const key = entryKey(chapterId, chapter);
  store[key] = { at: Date.now(), pages, chapter: chapter?.trim() || null };
  // Drop unversioned legacy key so Next can't revive poison under bare id.
  if (key !== chapterId) delete store[chapterId];
  writeStore(store);
}
