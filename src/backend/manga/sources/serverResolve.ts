import type { MangaChapter, MangaChapterGroup } from "@/backend/manga/types";

export async function fetchMirrorChaptersFromServer(
  title: string,
  alternateTitles: string[],
  language: string,
): Promise<{
  chapters: MangaChapter[];
  chapterGroups: MangaChapterGroup[];
} | null> {
  if (typeof fetch === "undefined") return null;
  try {
    const params = new URLSearchParams({ title, language });
    if (alternateTitles.length > 0) {
      params.set("alts", alternateTitles.slice(0, 16).join("\n"));
    }
    const res = await fetch(`/api/manga/chapters?${params.toString()}`, {
      signal: AbortSignal.timeout(28000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      chapters?: MangaChapter[];
      chapterGroups?: MangaChapterGroup[];
    };
    if (!data.chapters?.length) return null;
    return {
      chapters: data.chapters,
      chapterGroups: data.chapterGroups ?? [
        { volume: "none", chapters: data.chapters },
      ],
    };
  } catch {
    return null;
  }
}
