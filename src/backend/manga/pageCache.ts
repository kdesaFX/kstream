// v8: WC spine again (Comick stubs lack images); keep chapter gates.
const STORAGE_KEY = "__kstream:mangaPages:v8";
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
  // Prefer bare id (authoritative for WC/Comick). Fall back to id#chapter for
  // older same-version writes; never return a mismatched #chapter entry.
  const bare = store[chapterId];
  if (bare && Date.now() - bare.at <= TTL_MS && bare.pages.length > 0) {
    if (
      chapter?.trim() &&
      bare.chapter?.trim() &&
      bare.chapter.trim() !== chapter.trim()
    ) {
      // Stale art parked under this id — drop it.
      delete store[chapterId];
      writeStore(store);
      return null;
    }
    return bare.pages;
  }

  if (!chapter?.trim()) return null;
  const keyed = store[entryKey(chapterId, chapter)];
  if (!keyed || Date.now() - keyed.at > TTL_MS) return null;
  return keyed.pages.length > 0 ? keyed.pages : null;
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
  // Always write the bare id key so Next can't miss the entry when the chapter
  // hint is momentarily stale. Drop any id#* variants for this chapter.
  for (const key of Object.keys(store)) {
    if (key.startsWith(`${chapterId}#`)) delete store[key];
  }
  store[chapterId] = {
    at: Date.now(),
    pages,
    chapter: chapter?.trim() || null,
  };
  writeStore(store);
}
