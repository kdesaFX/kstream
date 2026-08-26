const PREFIX = "manga";

/** Dev-only performance marks for manga load stages. */
export function mangaMark(stage: string): void {
  if (typeof performance === "undefined") return;
  try {
    performance.mark(`${PREFIX}:${stage}`);
  } catch {
    /* ignore */
  }
}

export function mangaMeasure(name: string, start: string, end: string): void {
  if (typeof performance === "undefined") return;
  try {
    performance.measure(`${PREFIX}:${name}`, `${PREFIX}:${start}`, `${PREFIX}:${end}`);
    if (import.meta.env.DEV) {
      const entries = performance.getEntriesByName(`${PREFIX}:${name}`);
      const last = entries[entries.length - 1];
      if (last) {
        // eslint-disable-next-line no-console
        console.debug(`[manga] ${name}: ${Math.round(last.duration)}ms`);
      }
    }
  } catch {
    /* ignore */
  }
}
