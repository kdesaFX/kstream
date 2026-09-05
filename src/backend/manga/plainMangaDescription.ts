/** MangaDex credit lines pasted onto the end of many synopses. */
const CREDIT_LINE =
  /\*\*(?:Character Designer|Author(?:\(s\))? and Artist(?:\(s\))?|Artist(?:\(s\))?|Serialization|Licensed(?: in)?|Translation(?: and Localization)?|Original Work|Publisher(?:\(s\))?)\s*:/i;

/** AniList / aggregator fluff stuck after the plot (`(Source: …)`, `Notes:`). */
const TRAILING_META =
  /\s*(?:\(?\s*Source\s*:|Notes?\s*:)/i;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  bull: "•",
  midot: "·",
};

/** Decode common HTML entities left in catalog synopses (`&rdquo;` etc.). */
export function decodeDescriptionEntities(value: string): string {
  let text = value;
  // A few passes so nested forms like `&amp;rdquo;` fully resolve.
  for (let pass = 0; pass < 3; pass += 1) {
    const next = text
      .replace(/&#x([0-9a-f]+);/gi, (match, hex: string) => {
        const code = Number.parseInt(hex, 16);
        if (!Number.isFinite(code)) return match;
        try {
          return String.fromCodePoint(code);
        } catch {
          return match;
        }
      })
      .replace(/&#(\d+);/g, (match, n: string) => {
        const code = Number(n);
        if (!Number.isFinite(code)) return match;
        try {
          return String.fromCodePoint(code);
        } catch {
          return match;
        }
      })
      .replace(/&([a-z]+);/gi, (match, name: string) => {
        return NAMED_ENTITIES[name.toLowerCase()] ?? match;
      });
    if (next === text) break;
    text = next;
  }
  return text;
}

/**
 * Turn a MangaDex / AniList description into plain synopsis text.
 * Credits, source lines, notes, and HTML entities do not belong in the hero.
 */
export function plainMangaDescription(raw: string): string {
  let text = raw.trim();
  if (!text) return "";

  text = decodeDescriptionEntities(text);

  const hrSplit = text.split(/\n---+\s*\n/);
  if (hrSplit.length > 1) text = hrSplit[0]!.trim();

  const creditAt = text.search(CREDIT_LINE);
  if (creditAt > 0) text = text.slice(0, creditAt).trim();

  const metaAt = text.search(TRAILING_META);
  if (metaAt > 0) text = text.slice(0, metaAt).trim();

  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  text = text.replace(/\*\*([^*]+)\*\*/g, "$1");
  text = text.replace(/__([^_]+)__/g, "$1");
  text = text.replace(/\*([^*]+)\*/g, "$1");
  text = text.replace(/_([^_]+)_/g, "$1");
  text = text.replace(/https?:\/\/\S+/g, "");
  text = text.replace(/[\s_]+$/g, "").trim();

  return text.replace(/\s+/g, " ").trim();
}
