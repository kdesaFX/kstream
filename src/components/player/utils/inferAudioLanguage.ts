/**
 * Infer an ISO-ish language code from HLS/audio track metadata when
 * `lang` is missing. Only uses the track label/name — no ML.
 * Returns null when nothing reliable is found.
 */
const CODE_ALIASES: Record<string, string> = {
  en: "en",
  eng: "en",
  english: "en",
  es: "es",
  spa: "es",
  spanish: "es",
  castellano: "es",
  latino: "es",
  latam: "es",
  fr: "fr",
  fre: "fr",
  fra: "fr",
  french: "fr",
  français: "fr",
  francais: "fr",
  de: "de",
  ger: "de",
  deu: "de",
  german: "de",
  deutsch: "de",
  it: "it",
  ita: "it",
  italian: "it",
  italiano: "it",
  pt: "pt",
  por: "pt",
  portuguese: "pt",
  português: "pt",
  portugues: "pt",
  "pt-br": "pt",
  brazilian: "pt",
  ru: "ru",
  rus: "ru",
  russian: "ru",
  ja: "ja",
  jpn: "ja",
  japanese: "ja",
  ko: "ko",
  kor: "ko",
  korean: "ko",
  zh: "zh",
  chi: "zh",
  zho: "zh",
  chinese: "zh",
  mandarin: "zh",
  cantonese: "zh",
  ar: "ar",
  ara: "ar",
  arabic: "ar",
  hi: "hi",
  hin: "hi",
  hindi: "hi",
  nl: "nl",
  dut: "nl",
  nld: "nl",
  dutch: "nl",
  pl: "pl",
  pol: "pl",
  polish: "pl",
  tr: "tr",
  tur: "tr",
  turkish: "tr",
  th: "th",
  tha: "th",
  thai: "th",
  vi: "vi",
  vie: "vi",
  vietnamese: "vi",
  sv: "sv",
  swe: "sv",
  swedish: "sv",
  da: "da",
  dan: "da",
  danish: "da",
  no: "no",
  nor: "no",
  norwegian: "no",
  fi: "fi",
  fin: "fi",
  finnish: "fi",
  cs: "cs",
  cze: "cs",
  ces: "cs",
  czech: "cs",
  hu: "hu",
  hun: "hu",
  hungarian: "hu",
  ro: "ro",
  rum: "ro",
  ron: "ro",
  romanian: "ro",
  uk: "uk",
  ukr: "uk",
  ukrainian: "uk",
  he: "he",
  heb: "he",
  hebrew: "he",
  id: "id",
  ind: "id",
  indonesian: "id",
  ms: "ms",
  may: "ms",
  malay: "ms",
  el: "el",
  gre: "el",
  ell: "el",
  greek: "el",
};

function normalizeToken(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function resolveAudioLanguage(
  lang?: string | null,
  label?: string | null,
): string {
  const trimmedLang = lang?.trim();
  if (trimmedLang && trimmedLang.toLowerCase() !== "unknown") {
    return trimmedLang;
  }

  if (!label?.trim()) return "unknown";

  const normalized = normalizeToken(label);
  // Prefer longer phrases first so "pt-br" / "brazilian portuguese" win
  const keys = Object.keys(CODE_ALIASES).sort((a, b) => b.length - a.length);

  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, "i");
    if (re.test(normalized)) return CODE_ALIASES[key];
  }

  return "unknown";
}
