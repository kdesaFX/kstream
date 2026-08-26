import { useTranslation } from "react-i18next";
import { useMemo } from "react";

import { chapterLabel } from "@/backend/manga/mangadex";
import type { MangaChapter } from "@/backend/manga/types";

import { MangaReaderPicker } from "./MangaReaderPicker";

export function MangaChapterPicker({
  chapters,
  currentChapterId,
  onSelect,
  onPrefetch,
}: {
  chapters: MangaChapter[];
  currentChapterId?: string;
  onSelect: (chapter: MangaChapter) => void;
  onPrefetch?: (chapter: MangaChapter) => void;
}) {
  const { t } = useTranslation();
  const chapterById = useMemo(
    () => new Map(chapters.map((ch) => [ch.id, ch])),
    [chapters],
  );
  return (
    <MangaReaderPicker
      items={chapters.map((ch) => ({ id: ch.id, label: chapterLabel(ch) }))}
      selectedId={currentChapterId}
      searchPlaceholder={t("manga.reader.chapterSearch")}
      emptyLabel={t("manga.reader.chapterSearchEmpty")}
      emptyTriggerLabel={t("manga.reader.chapterEmpty")}
      onSelect={(id) => {
        const chapter = chapterById.get(id);
        if (chapter) onSelect(chapter);
      }}
      onItemHover={(id) => {
        const chapter = chapterById.get(id);
        if (chapter) onPrefetch?.(chapter);
      }}
    />
  );
}
