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
        // Feed Chromecast the already-resolved single-variant media playlist
        // instead of the master. Confirmed live (2026-07-09): the master
        // makes Shaka Player do its own variant-selection fetch through
        // artemis — that's where playback was silently stalling (infinite
        // yellow line). The resolved variant's own playlist already contains
        // real CDN segment URLs directly (one artemis hop, then straight to
        // hls-aws.shegu.net), so the receiver just plays a flat file with no
        // further negotiation. Falls back to the master if unavailable
        // (e.g. display doesn't implement it, or hls.js hasn't picked a
        // level yet).
        const resolvedUrl = display?.getResolvedVariantUrl?.();
        if (resolvedUrl) contentUrl = resolvedUrl;

        // Real, client-probed codec data — harmless to keep sending even
        // though a resolved media playlist has no #EXT-X-STREAM-INF lines
        // for it to apply to; costs nothing, helps if we ever fall back to
        // handing Chromecast a master again.
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
