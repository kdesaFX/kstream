/// <reference types="chromecast-caf-sender" />

// Minimal Chromecast wrapper. Unlike the previous implementation, casting is
// NOT a DisplayInterface that gets swapped into the player store — it's a
// standalone side-channel with its own tiny state, so it can never again leak
// into the generic event bus that every other player feature depends on.

const CHROMECAST_SENDER_SDK =
  "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";

type ConnectionListener = (connected: boolean) => void;

let initialized = false;
let sdkAvailable: boolean | null = null;
const availabilityCallbacks: ((available: boolean) => void)[] = [];
const connectionListeners = new Set<ConnectionListener>();

let context: cast.framework.CastContext | null = null;
let player: cast.framework.RemotePlayer | null = null;
let controller: cast.framework.RemotePlayerController | null = null;

function notifyAvailability(available: boolean) {
  sdkAvailable = available;
  availabilityCallbacks.splice(0).forEach((cb) => cb(available));
}

export function onChromecastAvailable(cb: (available: boolean) => void) {
  if (sdkAvailable !== null) {
    setTimeout(() => cb(sdkAvailable as boolean), 0);
    return;
  }
  availabilityCallbacks.push(cb);
}

function setupContext() {
  if (!(window as any).cast?.framework) return;
  context = cast.framework.CastContext.getInstance();

  const options: cast.framework.CastOptions = {
    receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
    autoJoinPolicy: cast.framework.AutoJoinPolicy.ORIGIN_SCOPED,
  };
  context.setOptions(options);

  player = new cast.framework.RemotePlayer();
  controller = new cast.framework.RemotePlayerController(player);
  controller.addEventListener(
    cast.framework.RemotePlayerEventType.IS_CONNECTED_CHANGED,
    () => {
      connectionListeners.forEach((cb) => cb(!!player?.isConnected));
    },
  );
}

export function initChromecast() {
  if (initialized) return;
  initialized = true;

  (window as any).__onGCastApiAvailable = (isAvailable: boolean) => {
    try {
      if (isAvailable) setupContext();
    } catch (e) {
      console.warn("Chromecast initialization error:", e);
    } finally {
      notifyAvailability(!!isAvailable);
    }
  };

  if (!document.getElementById("chromecast-script")) {
    const script = document.createElement("script");
    script.src = CHROMECAST_SENDER_SDK;
    script.id = "chromecast-script";
    script.onerror = () => console.warn("Failed to load Chromecast SDK");
    document.body.appendChild(script);
  }
}

export function onChromecastConnectionChange(cb: ConnectionListener) {
  connectionListeners.add(cb);
  return () => connectionListeners.delete(cb);
}

export function isChromecastConnected() {
  return !!player?.isConnected;
}

export function requestChromecastSession() {
  context?.requestSession().catch(() => {});
}

export function endChromecastSession() {
  context?.endCurrentSession(true);
}

export interface ChromecastMediaOptions {
  url: string;
  contentType: string;
  title?: string;
}

export function loadChromecastMedia(ops: ChromecastMediaOptions) {
  const session = context?.getCurrentSession();
  if (!session) return;

  const metaData = new chrome.cast.media.GenericMediaMetadata();
  if (ops.title) metaData.title = ops.title;

  const mediaInfo = new chrome.cast.media.MediaInfo(ops.url, ops.contentType);
  mediaInfo.streamType = chrome.cast.media.StreamType.BUFFERED;
  mediaInfo.metadata = metaData;

  const request = new chrome.cast.media.LoadRequest(mediaInfo);
  request.autoplay = true;

  session.loadMedia(request).catch((err: unknown) => {
    console.warn("Chromecast load failed:", err);
  });
}
