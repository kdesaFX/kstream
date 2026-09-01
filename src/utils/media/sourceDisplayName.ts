/** Public labels for provider ids (scrape ids stay unchanged). */
const SOURCE_NAME_ALIASES: Record<string, string> = {
  peestream: "kdesa",
  way2movies: "brandon",
  cornclick: "brian",
  tqq: "TQQ",
};

export function resolveSourceDisplayName(
  sourceId: string,
  providerName?: string | null,
): string {
  const alias = SOURCE_NAME_ALIASES[sourceId];
  if (alias) return alias;
  const trimmed = providerName?.trim();
  if (trimmed) return trimmed;
  return sourceId;
}
