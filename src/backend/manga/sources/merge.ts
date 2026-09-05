import type { MangaChapter, MangaSource } from "@/backend/manga/types";

function chapterNum(ch: MangaChapter | undefined): number | null {
  if (!ch?.chapter) return null;
  const n = parseFloat(ch.chapter);
  return Number.isFinite(n) ? n : null;
}

/** Lower wins. Comick first — WeebCentral CDN mixes volume covers across
 * chapter ids during rapid Next; Comick/MangaSee stay chapter-stable. */
function sourcePriority(source: MangaSource | undefined): number {
  switch (source) {
    case "comick":
      return 0;
    case "weebcentral":
      return 1;
    case "mangadex":
      return 2;
    default:
      return 9;
  }
}

export interface MergedChapters {
  chapters: MangaChapter[];
  /** Alternate chapter ids for the same number — used when page load fails. */
  fallbacks: Map<string, string[]>;
}

/**
 * Union chapters by chapter number. Prefer a source that actually has pages
 * when MangaDex only has a licensed stub (pages: 0 / external).
 */
export function mergeChapterLists(
  lists: { source: MangaSource; chapters: MangaChapter[] }[],
): MergedChapters {
  const byNumber = new Map<
    string,
    { primary: MangaChapter; alts: string[] }
  >();

  const readableScore = (ch: MangaChapter) => {
    if ((ch.pages ?? 0) > 0) return 1;
    // WC/Comick chapter lists don't include page counts — treat as readable.
    if (ch.source === "weebcentral" || ch.source === "comick") return 1;
    return 0;
  };

  for (const list of lists) {
    for (const ch of list.chapters) {
      const key = ch.chapter?.trim() || ch.id;
      const existing = byNumber.get(key);
      if (!existing) {
        byNumber.set(key, { primary: ch, alts: [] });
        continue;
      }
      const curRead = readableScore(existing.primary);
      const newRead = readableScore(ch);
      const curPri = sourcePriority(existing.primary.source);
      const newPri = sourcePriority(ch.source);

      // A readable mirror beats an empty MangaDex official stub.
      if (newRead > curRead || (newRead === curRead && newPri < curPri)) {
        byNumber.set(key, {
          primary: ch,
          alts: [existing.primary.id, ...existing.alts],
        });
      } else if (existing.primary.id !== ch.id) {
        existing.alts.push(ch.id);
      }
    }
  }

  const chapters = [...byNumber.values()]
    .map((v) => v.primary)
    .sort((a, b) => {
      const na = chapterNum(a);
      const nb = chapterNum(b);
      if (na != null && nb != null) return na - nb;
      if (na != null) return -1;
      if (nb != null) return 1;
      return (a.chapter ?? "").localeCompare(b.chapter ?? "", undefined, {
        numeric: true,
      });
    });

  const fallbacks = new Map<string, string[]>();
  for (const { primary, alts } of byNumber.values()) {
    if (alts.length > 0) fallbacks.set(primary.id, alts);
  }

  return { chapters, fallbacks };
}

export function asSingleGroup(chapters: MangaChapter[]) {
  return [{ volume: "none", chapters }];
}
