import { useEffect, useState } from "react";

import { Spinner } from "@/components/layout/Spinner";
import { usePlayerStore } from "@/stores/player/store";

/** Ignore brief waiting blips so mid-play stalls don't flash a spinner. */
const LOADING_SPINNER_DELAY_MS = 450;

export function LoadingSpinner() {
  const isLoading = usePlayerStore((s) => s.mediaPlaying.isLoading);
  const qualityHopFallback = usePlayerStore((s) => s.qualityHopFallback);
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Quality/audio hops & mirror retries are background work — keep the stage
    // on the last frame instead of covering it with loading chrome.
    if (!isLoading || qualityHopFallback) {
      setShow(false);
      return undefined;
    }
    const id = window.setTimeout(() => setShow(true), LOADING_SPINNER_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [isLoading, qualityHopFallback]);

  if (!show) return null;

  return <Spinner className="text-4xl" />;
}
