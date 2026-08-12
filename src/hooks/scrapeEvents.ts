export interface ScrapingItems {
  id: string;
  children: string[];
}

export interface ScrapingSegment {
  name: string;
  id: string;
  embedId?: string;
  status: "failure" | "pending" | "notfound" | "success" | "waiting";
  reason?: string;
  error?: any;
  percentage: number;
}

function isInFlight(status: ScrapingSegment["status"] | undefined): boolean {
  return status === "pending" || status === "waiting";
}

export function parentSourceId(
  id: string,
  sourceOrder: ScrapingItems[],
): string {
  if (sourceOrder.some((s) => s.id === id)) return id;
  const parent = sourceOrder.find((s) => s.children.includes(id));
  return parent?.id ?? id;
}

/** Keep the list on the source that's already spinning; don't jump to a racer. */
export function currentSourceOnStart(
  current: string | undefined,
  startedId: string,
  sources: Record<string, ScrapingSegment>,
  sourceOrder: ScrapingItems[],
): string {
  if (!current) return startedId;
  const currentParent = parentSourceId(current, sourceOrder);
  const startedParent = parentSourceId(startedId, sourceOrder);
  if (startedParent === currentParent) return startedId;

  const currentSeg = sources[current];
  const parentSeg = sources[currentParent];
  if (isInFlight(currentSeg?.status) || isInFlight(parentSeg?.status)) {
    return current;
  }
  return startedId;
}

/** After a miss, slide to the next pending source instead of resetting the list. */
export function currentSourceAfterUpdate(
  current: string | undefined,
  sources: Record<string, ScrapingSegment>,
  sourceOrder: ScrapingItems[],
): string | undefined {
  if (!current) return current;
  const parent = parentSourceId(current, sourceOrder);
  const currentSeg = sources[current];
  const parentSeg = sources[parent];
  if (currentSeg?.status === "pending" || parentSeg?.status === "pending") {
    return current;
  }
  if (currentSeg?.status === "success" || parentSeg?.status === "success") {
    return current;
  }

  const parentItem = sourceOrder.find((s) => s.id === parent);
  const nextChild = parentItem?.children.find((id) =>
    isInFlight(sources[id]?.status),
  );
  if (nextChild) return nextChild;

  const nextSource = sourceOrder.find((s) =>
    isInFlight(sources[s.id]?.status),
  );
  return nextSource?.id ?? current;
}

export function shouldIgnoreStaleProgress(
  existing: ScrapingSegment | undefined,
  nextStatus: ScrapingSegment["status"],
): boolean {
  if (!existing) return true;
  if (nextStatus !== "pending") return false;
  return (
    existing.status === "success" ||
    existing.status === "notfound" ||
    existing.status === "failure"
  );
}
