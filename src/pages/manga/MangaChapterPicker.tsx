import { useTranslation } from "react-i18next";

import { chapterLabel } from "@/backend/manga/mangadex";
import type { MangaChapter } from "@/backend/manga/types";

import { MangaReaderPicker } from "./MangaReaderPicker";

export function MangaChapterPicker({
  chapters,
  currentChapterId,
  onSelect,
}: {
  chapters: MangaChapter[];
  currentChapterId?: string;
  onSelect: (chapter: MangaChapter) => void;
}) {
  const { t } = useTranslation();
  return (
    <MangaReaderPicker
      items={chapters.map((ch) => ({ id: ch.id, label: chapterLabel(ch) }))}
      selectedId={currentChapterId}
      searchPlaceholder={t("manga.reader.chapterSearch")}
      emptyLabel={t("manga.reader.chapterSearchEmpty")}
      onSelect={(id) => {
        const chapter = chapters.find((ch) => ch.id === id);
        if (chapter) onSelect(chapter);
      }}
    />
  );
}
