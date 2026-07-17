import { useEffect, useState } from "react";

import {
  isAirplayAvailable,
  onAirplayConnectionChange,
  triggerAirplayPicker,
} from "@/components/player/casting/airplay";
import {
  endChromecastSession,
  initChromecast,
  loadChromecastMedia,
  onChromecastAvailable,
  onChromecastConnectionChange,
  requestChromecastSession,
} from "@/components/player/casting/chromecastSession";
import { usePlayerStore } from "@/stores/player/store";
import { selectQuality } from "@/stores/player/utils/qualities";
import { useQualityStore } from "@/stores/quality";

export type CastType = "chromecast" | "airplay" | null;

// Casting lives entirely outside usePlayerStore's AllSlices on purpose -- see
// the plan notes on why the old CastingSlice + DisplayInterface-swap design
// made a real bug impossible to isolate. This hook is the only place casting
// state exists; the local <video> element is simply paused while casting,
// never torn down or replaced.
//
// The Chromecast receiver is handed the exact same URL the local player
// itself resolved to -- whatever selectQuality() picked, unmodified. No
// proxy-URL reconstruction, no client-side manifest fetch-and-embed. The
// receiver fetches it directly, same as any other HLS client. A source
// whose URL genuinely isn't reachable/CORS-correct from the receiver's
// origin will fail to cast -- that's a real problem with the source, and
// working around it client-side (the previous approach) only hid it behind
// a silent "connects, then nothing happens" failure instead of fixing it.
export function useCasting() {
  const [chromecastAvailable, setChromecastAvailable] = useState(false);
  const [chromecastConnected, setChromecastConnected] = useState(false);
  const [airplayConnected, setAirplayConnected] = useState(false);
  const [castError, setCastError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const source = usePlayerStore((s) => s.source);
  const meta = usePlayerStore((s) => s.meta);
  const display = usePlayerStore((s) => s.display);
  const currentTime = usePlayerStore((s) => s.progress.time);

  useEffect(() => {
    initChromecast();
    onChromecastAvailable(setChromecastAvailable);
  }, []);

  useEffect(
    () => onChromecastConnectionChange(setChromecastConnected),
    [],
  );

  // Re-subscribe whenever the local video element is (re)created -- it shares
  // a lifecycle with `display` (both are recreated by VideoContainer).
  useEffect(() => onAirplayConnectionChange(setAirplayConnected), [display]);

  async function startChromecast() {
    if (!source) return;
    setCastError(null);
    setIsConnecting(true);
    try {
      const session = await requestChromecastSession();
      const qualityPreferences = useQualityStore.getState().quality;
      const { stream } = selectQuality(source, qualityPreferences);
      const contentType =
        stream.type === "hls" ? "application/x-mpegurl" : "video/mp4";

      await loadChromecastMedia(session, {
        url: stream.url,
        contentType,
        title: meta?.title,
        currentTime,
      });
      display?.pause();
    } catch (err) {
      console.warn("Chromecast cast failed:", err);
      setCastError(err instanceof Error ? err.message : "Failed to cast");
    } finally {
      setIsConnecting(false);
    }
  }

  function stop() {
    if (chromecastConnected) endChromecastSession();
    setCastError(null);
  }

  const isCasting = chromecastConnected || airplayConnected;
  const castType: CastType = chromecastConnected
    ? "chromecast"
    : airplayConnected
      ? "airplay"
      : null;

  return {
    isCasting,
    isConnecting,
    castType,
    castError,
    chromecastAvailable,
    airplayAvailable: isAirplayAvailable(),
    startChromecast,
    startAirplay: triggerAirplayPicker,
    stop,
  };
}
