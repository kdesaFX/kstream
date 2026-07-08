/// <reference types="chromecast-caf-sender"/>

import fscreen from "fscreen";

import { MWMediaType } from "@/backend/metadata/types/mw";
import {
  DisplayCaption,
  DisplayInterface,
  DisplayInterfaceEvents,
  DisplayMeta,
} from "@/components/player/display/displayInterface";
import { convertSubtitlesToVttDataurl } from "@/components/player/utils/captions";
import {
  createM3U8ProxyUrl,
  createMP4ProxyUrl,
  isUrlAlreadyProxied,
} from "@/components/player/utils/proxy";
import { LoadableSource } from "@/stores/player/utils/qualities";
import { processCdnLink } from "@/utils/cdn";
import { canFullscreen, canFullscreenAnyElement } from "@/utils/detectFeatures";
import { makeEmitter } from "@/utils/events";

export interface ChromeCastDisplayInterfaceOptions {
  controller: cast.framework.RemotePlayerController;
  player: cast.framework.RemotePlayer;
  instance: cast.framework.CastContext;
}

/*
 ** Chromecasting limitations:
 **  1. HLS - we've having some issues with content types. sometimes it loads, sometimes it doesn't
 */

export function makeChromecastDisplayInterface(
  ops: ChromeCastDisplayInterfaceOptions,
): DisplayInterface {
  const { emit, on, off } = makeEmitter<DisplayInterfaceEvents>();
  let isPaused = false;
  let playbackRate = 1;
  let source: LoadableSource | null = null;
  let videoElement: HTMLVideoElement | null = null;
  let containerElement: HTMLElement | null = null;
  let isFullscreen = false;
  let isPausedBeforeSeeking = false;
  let isSeeking = false;
  let startAt = 0;
  let meta: DisplayMeta = {
    title: "",
    type: MWMediaType.MOVIE,
  };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let caption: DisplayCaption | null = null;

  function listenForEvents() {
    const listen = (e: cast.framework.RemotePlayerChangedEvent) => {
      switch (e.field) {
        case "volumeLevel":
          emit("volumechange", e.value);
          break;
        case "currentTime":
          emit("time", e.value);
          break;
        case "duration":
          emit("duration", e.value ?? 0);
          break;
        case "mediaInfo":
          if (e.value) emit("duration", e.value.duration ?? 0);
          break;
        case "playerState":
          emit("loading", e.value === "BUFFERING");
          if (e.value === "PLAYING") emit("play", undefined);
          else if (e.value === "PAUSED") emit("pause", undefined);
          else if (e.value === "IDLE") {
            // IDLE with idleReason "ERROR" means the receiver failed during
            // an actual playback attempt (as opposed to a clean end/cancel) —
            // previously silent: no BUFFERING/PLAYING/PAUSED event ever
            // followed a failed load, so the UI just froze on whatever state
            // it last had (matches reports of a stuck progress bar and a
            // play/pause button that does nothing).
            const media = ops.instance.getCurrentSession()?.getMediaSession();
            const idleReason = (media as any)?.idleReason;
            if (idleReason === chrome.cast.media.IdleReason.ERROR) {
              emit("loading", false);
              emit("error", {
                type: "global",
                errorName: "chromecast_playback_failure",
                message: `Receiver reported idleReason=ERROR${
                  (media as any)?.extendedStatus
                    ? `: ${JSON.stringify((media as any).extendedStatus)}`
                    : ""
                }`,
              });
            }
          }
          isPaused = e.value === "PAUSED";
          break;
        case "isMuted":
          emit("volumechange", e.value ? 0 : ops.player.volumeLevel);
          break;
        case "displayStatus":
        case "canSeek":
        case "title":
        case "isPaused":
        case "canPause":
        case "isMediaLoaded":
        case "statusText":
        case "isConnected":
        case "displayName":
        case "canControlVolume":
        case "savedPlayerState":
          break;
        default:
          break;
      }
    };
    ops.controller?.addEventListener(
      cast.framework.RemotePlayerEventType.ANY_CHANGE,
      listen,
    );
    return () => {
      ops.controller?.removeEventListener(
        cast.framework.RemotePlayerEventType.ANY_CHANGE,
        listen,
      );
    };
  }

  // The Default Media Receiver only accepts sideloaded text tracks as VTT —
  // our caption sources are SRT, so convert the already-fetched srtData
  // (never the original .srt url, which the receiver can't render) into a
  // self-contained VTT data: URI. Data URIs resolve locally on the receiver
  // with no network round-trip, so this works regardless of CORS/headers.
  function buildCaptionTrack(c: DisplayCaption): chrome.cast.media.Track | null {
    if (!c.srtData?.trim()) return null;
    try {
      const vttDataUrl = convertSubtitlesToVttDataurl(c.srtData);
      const textTrack = new chrome.cast.media.Track(
        1,
        chrome.cast.media.TrackType.TEXT,
      );
      textTrack.trackContentType = "text/vtt";
      textTrack.trackContentId = vttDataUrl;
      textTrack.language = c.language;
      textTrack.name = c.language || "Subtitles";
      textTrack.subtype = chrome.cast.media.TextTrackType.SUBTITLES;
      return textTrack;
    } catch {
      return null;
    }
  }

  function setupSource() {
    if (!source) {
      ops.controller?.stop();
      return;
    }

    let type = "video/mp4";
    if (source.type === "hls") type = "application/x-mpegurl";

    const metaData = new chrome.cast.media.GenericMediaMetadata();
    metaData.title = meta.title;

    let contentUrl = processCdnLink(source.url);

    // Only proxy streams if they need it:
    // 1. Not already proxied AND
    // 2. Has headers (either preferredHeaders or headers)
    const allHeaders = {
      ...source.preferredHeaders,
      ...source.headers,
    };
    const hasHeaders = Object.keys(allHeaders).length > 0;

    // Handle HLS streams
    if (source.type === "hls") {
      if (!isUrlAlreadyProxied(source.url) && hasHeaders) {
        contentUrl = createM3U8ProxyUrl(source.url, allHeaders);
      }
    }
    // Handle MP4 streams with headers
    else if (source.type === "mp4" && hasHeaders) {
      contentUrl = createMP4ProxyUrl(source.url, source.headers || {});
    }

    const mediaInfo = new chrome.cast.media.MediaInfo(contentUrl, type);
    mediaInfo.streamType = chrome.cast.media.StreamType.BUFFERED;
    mediaInfo.metadata = metaData;
    mediaInfo.customData = {
      playbackRate,
    };

    const captionTrack = caption ? buildCaptionTrack(caption) : null;
    if (captionTrack) mediaInfo.tracks = [captionTrack];

    const request = new chrome.cast.media.LoadRequest(mediaInfo);
    request.autoplay = true;
    request.currentTime = startAt;
    if (captionTrack) request.activeTrackIds = [1];

    doLoadMedia(request);
  }

  // ops.instance.getCurrentSession() can briefly return null right after the
  // RemotePlayerController reports isConnected — the session object attaches
  // to CastContext a tick or two later. session?.loadMedia(...) previously
  // just no-op'd in that window: no request, no error, nothing — indistinguishable
  // from a network/referer problem. Retry for a couple seconds before giving up
  // loudly instead of silently.
  function doLoadMedia(request: chrome.cast.media.LoadRequest, attempt = 0) {
    const session = ops.instance.getCurrentSession();
    if (!session) {
      if (attempt >= 20) {
        emit("loading", false);
        emit("error", {
          type: "global",
          errorName: "chromecast_load_failure",
          message: "No active Cast session to load media into",
        });
        return;
      }
      setTimeout(() => doLoadMedia(request, attempt + 1), 100);
      return;
    }
    session
      .loadMedia(request)
      .then(() => {
        emit("loading", false);
      })
      .catch((err: unknown) => {
        // chrome.cast.ErrorCode.SESSION_ERROR means "session invalid or
        // receiver couldn't load the media" — seen in practice moments after
        // a session connects, before the receiver has actually finished
        // settling. Retry a few times before surfacing it as fatal, same as
        // the null-session case above.
        const code = (err as any)?.code;
        if (code === "session_error" && attempt < 20) {
          setTimeout(() => doLoadMedia(request, attempt + 1), 250);
          return;
        }
        emit("loading", false);
        emit("error", {
          type: "global",
          errorName: "chromecast_load_failure",
          message: (err as any)?.message ?? String(err),
        });
      });
  }

  function setSource() {
    if (!source) return;
    setupSource();
  }

  function destroyVideoElement() {
    if (videoElement) videoElement = null;
  }

  function fullscreenChange() {
    isFullscreen =
      !!document.fullscreenElement || // other browsers
      !!(document as any).webkitFullscreenElement; // safari
    emit("fullscreen", isFullscreen);
    if (!isFullscreen) emit("needstrack", false);
  }
  fscreen.addEventListener("fullscreenchange", fullscreenChange);

  // start listening immediately
  const stopListening = listenForEvents();

  return {
    on,
    off,
    getType() {
      return "casting";
    },
    destroy: () => {
      stopListening();
      destroyVideoElement();
      fscreen.removeEventListener("fullscreenchange", fullscreenChange);
    },
    load(loadOps) {
      source = loadOps.source;
      emit("loading", true);
      startAt = loadOps.startAt;
      setSource();
    },
    changeQuality() {
      // cant control qualities
    },
    setCaption(newCaption) {
      const hadTrackLoaded = !!caption;
      caption = newCaption;

      // Turning captions OFF just deactivates the already-loaded track — no
      // reload needed. Turning them ON (or switching to a different one) has
      // to go through setSource() so the receiver actually receives the new
      // track in mediaInfo.tracks; editTracksInfo can only toggle a track id
      // that was already part of the original LoadRequest.
      if (!newCaption) {
        const session = ops.instance.getCurrentSession();
        const media = session?.getMediaSession();
        try {
          if (media && hadTrackLoaded) {
            const req = new chrome.cast.media.EditTracksInfoRequest([]);
            (media as any).editTracksInfo(req);
            return;
          }
        } catch {
          // Fallback to reload if needed
        }
      }
      setSource();
    },

    processVideoElement(video) {
      destroyVideoElement();
      videoElement = video;
      setSource();
    },
    processContainerElement(container) {
      containerElement = container;
    },
    setMeta(data) {
      meta = data;
      setSource();
    },

    pause() {
      if (!ops.player.isPaused) {
        ops.controller.playOrPause();
      }
    },
    play() {
      if (ops.player.isPaused) {
        ops.controller.playOrPause();
      }
    },
    setSeeking(active) {
      if (active === isSeeking) return;
      isSeeking = active;

      // if it was playing when starting to seek, play again
      if (!active) {
        if (!isPausedBeforeSeeking) this.play();
        return;
      }

      isPausedBeforeSeeking = isPaused ?? true;
      this.pause();
    },
    setTime(t) {
      // clamp time between 0 and max duration if duration is known
      let time = t;
      if (!Number.isNaN(ops.player.duration)) {
        time = Math.min(t, ops.player.duration);
        time = Math.max(0, time);
      }

      if (Number.isNaN(time)) return;
      emit("time", time);
      ops.player.currentTime = time;
      ops.controller.seek();
    },
    async setVolume(v) {
      // clamp volume between 0 and 1
      let volume = Math.min(v, 1);
      volume = Math.max(0, volume);

      // Always control remote cast volume regardless of local platform restrictions
      ops.player.volumeLevel = volume;
      ops.controller.setVolumeLevel();
      emit("volumechange", volume);
    },
    toggleFullscreen() {
      if (isFullscreen) {
        isFullscreen = false;
        emit("fullscreen", isFullscreen);
        emit("needstrack", false);
        if (!fscreen.fullscreenElement) return;
        fscreen.exitFullscreen();
        return;
      }

      // enter fullscreen
      isFullscreen = true;
      emit("fullscreen", isFullscreen);
      if (!canFullscreen() || fscreen.fullscreenElement) return;
      if (canFullscreenAnyElement()) {
        if (containerElement) fscreen.requestFullscreen(containerElement);
      }
    },
    togglePictureInPicture() {
      // Can't PIP while Chromecasting
    },
    startAirplay() {
      // cant airplay while chromecasting
    },
    setPlaybackRate(rate) {
      // Default Media Receiver does not support changing playback rate dynamically.
      // Store locally and notify UI without reloading media.
      playbackRate = rate;
      emit("playbackrate", rate);
    },
    getCaptionList() {
      return [];
    },
    getSubtitleTracks() {
      return [];
    },
    async setSubtitlePreference() {
      return Promise.resolve();
    },
    changeAudioTrack() {
      // cant change audio tracks
    },
  };
}
