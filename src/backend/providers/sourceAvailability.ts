/**
 * Sources whose upstream service is gone, rather than temporarily failing.
 *
 * Reyna's only resolver host (api.reallyfast.xyz) no longer has DNS records,
 * and goated.cx now redirects to Discord. Keep it out of scrape runs until the
 * provider ships a replacement endpoint; otherwise every title gets a red
 * failure row and an avoidable network timeout.
 */
const unavailableSourceIds = new Set(["reyna"]);

export function filterUnavailableSourceIds(sourceIds: string[]): string[] {
  return sourceIds.filter((sourceId) => !unavailableSourceIds.has(sourceId));
}
