import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import {
  mangaLanguageLabel,
  sortMangaLanguages,
} from "@/backend/manga/languages";

import { MangaReaderPicker } from "./MangaReaderPicker";

export function MangaLanguagePicker({
  languages,
  selected,
  onSelect,
}: {
  languages: string[];
  selected: string;
  onSelect: (code: string) => void;
}) {
  const { t } = useTranslation();
  const items = useMemo(
    () =>
      sortMangaLanguages(languages).map((code) => ({
        id: code,
        label: mangaLanguageLabel(code),
      })),
    [languages],
  );

  if (items.length === 0) return null;

  return (
    <MangaReaderPicker
      items={items}
      selectedId={selected}
      searchPlaceholder={t("manga.reader.languageSearch")}
      emptyLabel={t("manga.reader.languageSearchEmpty")}
      onSelect={onSelect}
    />
  );
}
