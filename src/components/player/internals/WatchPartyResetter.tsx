import { useEffect, useMemo, useRef } from "react";

import { usePlayerStore } from "@/stores/player/store";
import { useWatchPartyStore } from "@/stores/watchParty";

export function WatchPartyResetter() {
  const meta = usePlayerStore((s) => s.meta);
  const { disable, isHost, enabled } = useWatchPartyStore();
  const previousBaseMediaRef = useRef<string | null>(null);

  const baseMediaId = useMemo(() => {
    if (!meta) return null;
    return `${meta.type}-${meta.tmdbId}`;
  }, [meta]);

  useEffect(() => {
    if (
      baseMediaId &&
      previousBaseMediaRef.current !== null &&
      baseMediaId !== previousBaseMediaRef.current &&
      isHost
    ) {
      disable();
    }
    previousBaseMediaRef.current = baseMediaId;
  }, [baseMediaId, disable, isHost]);

  useEffect(() => {
    return () => {
      if (useWatchPartyStore.getState().isHost && enabled) {
        return;
      }
    };
  }, [enabled]);

  return null;
}
