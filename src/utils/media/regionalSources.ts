export type RegionalSourceMeta = {
  id: string;
  /** ISO codes this source is expected to carry (e.g. es, it). */
  languages: string[];
  /** Lower = try earlier within the deferred lane. */
  priority?: number;
  /** Future: distinguish Latino vs Castellano in audioLabel. */
  dialect?: string;
};

/**
 * Deferred-only regional dub sources. Never enter the primary scrape race
 * (see excludeDeferredFromPrimary). Discovered after playback via
 * discoverAlternateAudioLanguages.
 *
 * Future: first-time setup → preferredAudioLanguages[] should boost matching
 * entries here in orderRegionalCandidates and optionally auto-switch when a
 * deferred hit matches the user's preference.
 */
export const DEFERRED_REGIONAL_SOURCES: RegionalSourceMeta[] = [
  { id: "lisbon", languages: ["es"], priority: 1, dialect: "latino" },
  { id: "cinehdplus", languages: ["es"], priority: 2, dialect: "castellano" },
  { id: "vixsrc", languages: ["it"], priority: 1 },
];

const DEFERRED_IDS = new Set(DEFERRED_REGIONAL_SOURCES.map((s) => s.id));

/** One promoted slot per missing language so ranked 1080p/4K sources keep budget. */
const PRIORITY_SLOTS_PER_LANGUAGE = 1;

export function isDeferredRegionalSource(id: string): boolean {
  return DEFERRED_IDS.has(id);
}

export function excludeDeferredFromPrimary(ids: string[]): string[] {
  return ids.filter((id) => !isDeferredRegionalSource(id));
}

export function regionalSourcesForLanguages(missing: Set<string>): string[] {
  return DEFERRED_REGIONAL_SOURCES.filter((meta) =>
    meta.languages.some((lang) => missing.has(lang)),
  )
    .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))
    .map((meta) => meta.id);
}

export function missingRegionalLanguages(have: Set<string>): Set<string> {
  const missing = new Set<string>();
  for (const meta of DEFERRED_REGIONAL_SOURCES) {
    for (const lang of meta.languages) {
      if (!have.has(lang)) missing.add(lang);
    }
  }
  return missing;
}

/**
 * Promote regional sources when their language is not in the audio menu yet.
 */
export function orderRegionalCandidates(
  regionalIds: string[],
  have: Set<string>,
): string[] {
  const missingLangs = missingRegionalLanguages(have);
  if (missingLangs.size === 0) return [...regionalIds];

  const prefer: string[] = [];
  const preferSet = new Set<string>();

  for (const lang of missingLangs) {
    let slots = 0;
    for (const meta of DEFERRED_REGIONAL_SOURCES) {
      if (slots >= PRIORITY_SLOTS_PER_LANGUAGE) break;
      if (!meta.languages.includes(lang)) continue;
      if (!regionalIds.includes(meta.id) || preferSet.has(meta.id)) continue;
      prefer.push(meta.id);
      preferSet.add(meta.id);
      slots += 1;
    }
  }

  const rest = regionalIds.filter((id) => !preferSet.has(id));
  return [...prefer, ...rest];
}

/** Ranked (non-regional) sources — order unchanged for quality-tier discovery. */
export function orderRankedCandidates(rankedIds: string[]): string[] {
  return [...rankedIds];
}
