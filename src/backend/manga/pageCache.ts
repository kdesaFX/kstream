// v3: invalidate caches that mixed series or stored wrong chapter prefixes
// (e.g. JJK ch13 showing 0030 / D.Gray-man pages that passed first-slug checks).
const STORAGE_KEY = "__kstream:mangaPages:v3";
const TTL_MS = 24 * 60 * 60 * 1000;

type Store = Record<string, { at: number; pages: string[] }>;

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

export function readPersistedPageCache(chapterId: string): string[] | null {
  const entry = readStore()[chapterId];
  if (!entry || Date.now() - entry.at > TTL_MS) return null;
  return entry.pages.length > 0 ? entry.pages : null;
}

export function clearPersistedPageCache(chapterId: string): void {
  const store = readStore();
  if (!(chapterId in store)) return;
  delete store[chapterId];
  writeStore(store);
}

export function writePersistedPageCache(chapterId: string, pages: string[]): void {
  if (!pages.length) return;
  const store = readStore();
  store[chapterId] = { at: Date.now(), pages };
  writeStore(store);
}
