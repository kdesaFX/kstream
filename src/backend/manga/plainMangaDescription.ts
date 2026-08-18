/** MangaDex credit lines pasted onto the end of many synopses. */
const CREDIT_LINE =
  /\*\*(?:Character Designer|Author(?:\(s\))? and Artist(?:\(s\))?|Artist(?:\(s\))?|Serialization|Licensed(?: in)?|Translation(?: and Localization)?|Original Work|Publisher(?:\(s\))?)\s*:/i;

/**
 * Turn a MangaDex markdown description into plain synopsis text.
 * Credits and links belong in structured fields, not raw `**…** [name](url)`.
 */
export function plainMangaDescription(raw: string): string {
  let text = raw.trim();
  if (!text) return "";

  const hrSplit = text.split(/\n---+\s*\n/);
  if (hrSplit.length > 1) text = hrSplit[0]!.trim();

  const creditAt = text.search(CREDIT_LINE);
  if (creditAt > 0) text = text.slice(0, creditAt).trim();

  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  text = text.replace(/\*\*([^*]+)\*\*/g, "$1");
  text = text.replace(/__([^_]+)__/g, "$1");
  text = text.replace(/\*([^*]+)\*/g, "$1");
  text = text.replace(/_([^_]+)_/g, "$1");
  text = text.replace(/https?:\/\/\S+/g, "");
  text = text.replace(/[\s_]+$/g, "").trim();

  return text.replace(/\s+/g, " ").trim();
}
