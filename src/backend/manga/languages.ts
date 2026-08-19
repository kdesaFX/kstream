const KNOWN_LABELS: Record<string, string> = {
  en: "English",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
  "zh-hk": "Chinese (Hong Kong)",
  "zh-ro": "Chinese (Romanized)",
  "ja-ro": "Japanese (Romanized)",
  "ko-ro": "Korean (Romanized)",
  es: "Spanish",
  "es-la": "Spanish (LatAm)",
  pt: "Portuguese",
  "pt-br": "Portuguese (Brazil)",
  fr: "French",
  de: "German",
  it: "Italian",
  ru: "Russian",
  pl: "Polish",
  tr: "Turkish",
  vi: "Vietnamese",
  th: "Thai",
  id: "Indonesian",
  ar: "Arabic",
};

export function mangaLanguageLabel(code: string): string {
  const raw = code.trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (KNOWN_LABELS[lower]) return KNOWN_LABELS[lower];
  try {
    const name = new Intl.DisplayNames(["en"], { type: "language" }).of(
      raw.replace(/_/g, "-"),
    );
    if (name && name.toLowerCase() !== lower) return name;
  } catch {
    // Unknown MangaDex tags (es-la, pt-br, …) fall through.
  }
  return raw;
}

/** English first, then A–Z by display name. */
export function sortMangaLanguages(codes: string[]): string[] {
  return [...new Set(codes.map((code) => code.trim()).filter(Boolean))].sort(
    (a, b) => {
      if (a.toLowerCase() === "en") return -1;
      if (b.toLowerCase() === "en") return 1;
      return mangaLanguageLabel(a).localeCompare(mangaLanguageLabel(b));
    },
  );
}
