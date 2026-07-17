/// <reference types="chromecast-caf-sender" />

// Chromecast wrapper. requestChromecastSession()/loadChromecastMedia() are
// both promise-driven off the SDK's own async APIs -- no polling/retry loop
// guessing when a session or media load is "ready". The previous
// implementation's retry loop existed to paper over a race that doesn't
// actually exist: CastContext.requestSession()'s own promise resolving IS
// the signal that getCurrentSession() is populated.

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

  // AutoJoinPolicy lives on chrome.cast, not cast.framework -- the type defs
  // don't expose it off cast.framework despite that being the SDK's own
  // namespace for CastOptions.
  const options: cast.framework.CastOptions = {
    receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
    autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
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
  return () => {
    connectionListeners.delete(cb);
  };
}

export function isChromecastConnected() {
  return !!player?.isConnected;
}

// Resolves once the device is actually connected and a session exists --
// callers can go straight from this to loadChromecastMedia without any
// separate wait/poll step.
export async function requestChromecastSession(): Promise<cast.framework.CastSession> {
  if (!context) throw new Error("Chromecast SDK not available yet");
  await context.requestSession();
  const session = context.getCurrentSession();
  if (!session) throw new Error("Chromecast session did not start");
  return session;
}

export function endChromecastSession() {
  context?.endCurrentSession(true);
}

export interface ChromecastMediaOptions {
  url: string;
  contentType: string;
  title?: string;
  currentTime?: number;
}

// Loads media on an already-connected session. No data: URI embedding, no
// manifest pre-fetching, no retry loop -- the receiver gets the exact same
// URL the local player itself resolved and fetches it directly, same as any
// other HLS client would. Throws on failure instead of swallowing it so the
// caller can surface a real error instead of a silently-stuck spinner.
export async function loadChromecastMedia(
  session: cast.framework.CastSession,
  ops: ChromecastMediaOptions,
) {
  const metaData = new chrome.cast.media.GenericMediaMetadata();
  if (ops.title) metaData.title = ops.title;

  const mediaInfo = new chrome.cast.media.MediaInfo(ops.url, ops.contentType);
  mediaInfo.streamType = chrome.cast.media.StreamType.BUFFERED;
  mediaInfo.metadata = metaData;

  const request = new chrome.cast.media.LoadRequest(mediaInfo);
  request.autoplay = true;
  if (ops.currentTime) request.currentTime = ops.currentTime;

  await session.loadMedia(request);
}
