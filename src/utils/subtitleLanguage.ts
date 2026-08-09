/**
 * Infer a language code from subtitle file contents when provider metadata is wrong.
 * Used to stop non-English tracks (e.g. Serbian Cyrillic) landing in the English bucket.
 */

function stripSubtitleChrome(text: string): string {
  return text
    .replace(/^WEBVTT[^\n]*\n?/i, '')
    .replace(/^\d+\s*$/gm, '')
    .replace(
      /\d{1,2}:\d{2}:\d{2}[.,]\d{1,3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[.,]\d{1,3}[^\n]*/g,
      '',
    )
    .replace(/<\/?[^>]+>/g, ' ')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function countMatches(text: string, re: RegExp): number {
  return (text.match(re) || []).length;
}

function guessCyrillicLanguage(text: string): string {
  const serbian = countMatches(text, /[ђјљњћџЂЈЉЊЋЏ]/g);
  const ukrainian = countMatches(text, /[іїєґІЇЄҐ]/g);
  const russian = countMatches(text, /[ёыэъЁЫЭЪ]/g);
  const bulgarian = countMatches(text, /[ъѝЪ]/g);

  if (serbian >= 2 && serbian >= ukrainian && serbian >= russian) return 'sr';
  if (ukrainian >= 2 && ukrainian >= russian) return 'uk';
  if (russian >= 2) return 'ru';
  if (bulgarian >= 3 && bulgarian > russian) return 'bg';
  // Default Cyrillic bucket — better as Russian than falsely English
  return 'ru';
}

/**
 * Returns a language code when the sample is clearly dominated by a non-Latin script,
 * otherwise null (leave the claimed label alone).
 */
export function inferLanguageFromSubtitleText(raw: string): string | null {
  const text = stripSubtitleChrome(raw).slice(0, 8000);
  if (text.length < 40) return null;

  const cyrillic = countMatches(text, /[\u0400-\u04FF]/g);
  const latin = countMatches(text, /[A-Za-z]/g);
  const arabic = countMatches(text, /[\u0600-\u06FF]/g);
  const hebrew = countMatches(text, /[\u0590-\u05FF]/g);
  const greek = countMatches(text, /[\u0370-\u03FF]/g);
  const cjk = countMatches(text, /[\u3040-\u30ff\u3400-\u9fff]/g);
  const hangul = countMatches(text, /[\uac00-\ud7af]/g);
  const thai = countMatches(text, /[\u0e00-\u0e7f]/g);
  const devanagari = countMatches(text, /[\u0900-\u097f]/g);

  const letters =
    cyrillic + latin + arabic + hebrew + greek + cjk + hangul + thai + devanagari;
  if (letters < 30) return null;

  const share = (n: number) => n / letters;

  if (share(cyrillic) >= 0.35 && cyrillic >= 20) return guessCyrillicLanguage(text);
  if (share(arabic) >= 0.35 && arabic >= 20) return 'ar';
  if (share(hebrew) >= 0.35 && hebrew >= 20) return 'he';
  if (share(greek) >= 0.35 && greek >= 20) return 'el';
  if (share(hangul) >= 0.35 && hangul >= 20) return 'ko';
  if (share(thai) >= 0.35 && thai >= 20) return 'th';
  if (share(devanagari) >= 0.35 && devanagari >= 20) return 'hi';
  if (share(cjk) >= 0.35 && cjk >= 20) {
    // Prefer Japanese if kana present, else Chinese
    if (countMatches(text, /[\u3040-\u30ff]/g) >= 8) return 'ja';
    return 'zh';
  }

  return null;
}

const LATIN_CLAIMED = new Set([
  'en',
  'eng',
  'unknown',
  'und',
  '',
]);

/**
 * If the claimed language is English/unknown but the text is clearly another script,
 * return the inferred code. Otherwise keep the claimed language.
 */
export function reconcileCaptionLanguage(
  claimed: string | undefined | null,
  rawSubtitle: string,
): string {
  const claimedNorm = (claimed || '').toLowerCase().trim();
  const base = claimedNorm.split('-')[0];
  const inferred = inferLanguageFromSubtitleText(rawSubtitle);

  if (!inferred) return claimedNorm || 'unknown';

  // Always correct English/unknown claims that don't match the script
  if (LATIN_CLAIMED.has(base) && inferred !== 'en') {
    return inferred;
  }

  // Also correct when claimed Latin language but body is non-Latin script
  if (
    inferred !== base &&
    ['en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'sv', 'no', 'da', 'fi', 'pl'].includes(
      base,
    ) &&
    !['en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'sv', 'no', 'da', 'fi', 'pl'].includes(
      inferred,
    )
  ) {
    return inferred;
  }

  return claimedNorm || inferred;
}
