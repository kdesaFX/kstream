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
import {
  createM3U8ProxyUrl,
  createMP4ProxyUrl,
  isUrlAlreadyProxied,
} from "@/components/player/utils/proxy";
import { usePlayerStore } from "@/stores/player/store";
import { selectQuality } from "@/stores/player/utils/qualities";
import { useQualityStore } from "@/stores/quality";
import { processCdnLink } from "@/utils/cdn";

export type CastType = "chromecast" | "airplay" | null;

// Casting lives entirely outside usePlayerStore's AllSlices on purpose — see
// the plan notes on why the old CastingSlice + DisplayInterface-swap design
// made a real bug impossible to isolate. This hook is the only place casting
// state exists; the local <video> element is simply paused while casting,
// never torn down or replaced.
export function useCasting() {
  const [chromecastAvailable, setChromecastAvailable] = useState(false);
  const [chromecastConnected, setChromecastConnected] = useState(false);
  const [airplayConnected, setAirplayConnected] = useState(false);

  const source = usePlayerStore((s) => s.source);
  const meta = usePlayerStore((s) => s.meta);
  const display = usePlayerStore((s) => s.display);

  useEffect(() => {
    initChromecast();
    onChromecastAvailable(setChromecastAvailable);
  }, []);

  useEffect(
    () => onChromecastConnectionChange(setChromecastConnected),
    [],
  );

  // Re-subscribe whenever the local video element is (re)created — it shares
  // a lifecycle with `display` (both are recreated by VideoContainer).
  useEffect(() => onAirplayConnectionChange(setAirplayConnected), [display]);

  useEffect(() => {
    if (!chromecastConnected || !source) return;
    const qualityPreferences = useQualityStore.getState().quality;
    const { stream } = selectQuality(source, qualityPreferences);

    let contentUrl = processCdnLink(stream.url);
    let contentType = "video/mp4";
    const allHeaders = { ...stream.preferredHeaders, ...stream.headers };
    const hasHeaders = Object.keys(allHeaders).length > 0;

    if (stream.type === "hls") {
      contentType = "application/x-mpegurl";
      if (!isUrlAlreadyProxied(stream.url) && hasHeaders) {
        contentUrl = createM3U8ProxyUrl(stream.url, allHeaders);
      } else {
        // Only the unproxied path (the common case for our own artemis /hls
        // URLs) — pass real, client-probed codec data through so Chromecast's
        // receiver (which never runs hls.js and needs CODECS in the manifest
        // text) gets ground truth instead of the backend's resolution guess.
        // See artemis/proxy.go's ?codecs= handling.
        const codecsHint = display?.getCodecsHint?.();
        if (codecsHint) {
          try {
            const u = new URL(contentUrl);
            u.searchParams.set("codecs", codecsHint);
            contentUrl = u.toString();
          } catch {
            // malformed URL — fall through with the un-hinted contentUrl
          }
        }
      }
    } else if (hasHeaders) {
      contentUrl = createMP4ProxyUrl(stream.url, allHeaders);
    }

    loadChromecastMedia({
      url: contentUrl,
      contentType,
      title: meta?.title,
    });
    display?.pause();
  }, [chromecastConnected, source, meta, display]);

  const isCasting = chromecastConnected || airplayConnected;
  const castType: CastType = chromecastConnected
    ? "chromecast"
    : airplayConnected
      ? "airplay"
      : null;

  return {
    isCasting,
    castType,
    chromecastAvailable,
    airplayAvailable: isAirplayAvailable(),
    startChromecast: requestChromecastSession,
    startAirplay: triggerAirplayPicker,
    stop: () => {
      if (chromecastConnected) endChromecastSession();
    },
  };
}
