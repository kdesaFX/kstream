import fscreen from "fscreen";
import Hls, { Level } from "hls.js";

import { ArtemisRetryLoader } from "@/components/player/display/hlsRetryLoader";

import {
  RULE_IDS,
  isExtensionActiveCached,
  setDomainRule,
} from "@/backend/extension/messaging";
import {
  DisplayInterface,
  DisplayInterfaceEvents,
} from "@/components/player/display/displayInterface";
import { handleBuffered } from "@/components/player/utils/handleBuffered";
import { getMediaErrorDetails } from "@/components/player/utils/mediaErrorDetails";
import { SpeechCapture } from "@/components/player/utils/speechCapture";
import { useLanguageStore } from "@/stores/language";
import { usePreferencesStore } from "@/stores/preferences";
import {
  LoadableSource,
  SourceQuality,
  getPreferredQuality,
  resolutionHeightToQuality,
} from "@/stores/player/utils/qualities";
import { processCdnLink } from "@/utils/hosting/cdn";
import {
  canChangeVolume,
  canFullscreen,
  canFullscreenAnyElement,
  canPictureInPicture,
  canPlayHlsNatively,
  canWebkitFullscreen,
  canWebkitPictureInPicture,
} from "@/utils/browser/detectFeatures";
import { makeEmitter } from "@/utils/common/events";

import { resolveAudioLanguage } from "@/components/player/utils/inferAudioLanguage";

function hlsLevelToQuality(level?: Level): SourceQuality | null {
  return resolutionHeightToQuality(level?.height ?? 0);
}

function hlsLevelsToQualities(levels: Level[]): SourceQuality[] {
  return levels
    .map((v) => hlsLevelToQuality(v))
    .filter((v): v is SourceQuality => !!v);
}


// Sort levels by quality (height) to ensure we can select the best one
function sortLevelsByQuality(levels: Level[]): Level[] {
  return [...levels].sort((a, b) => (b.height || 0) - (a.height || 0));
}

function isHevcLevel(level: Level): boolean {
  const codec = (level.videoCodec || "").toLowerCase();
  return codec.includes("hev1") || codec.includes("hvc1") || codec.includes("hevc");
}

function isAvcLevel(level: Level): boolean {
  const codec = (level.videoCodec || "").toLowerCase();
  return codec.includes("avc1") || codec.includes("avc3") || codec.includes("avc");
}

/**
 * Prefer a fast, playable start level.
 * - No extension (browser proxy): cap at 720p AVC — 1080p init through the
 *   proxy is multi‑MB and slows first frame.
 * - Extension or Windows app: prefer 1080p AVC — direct fetches can take it.
 */
function pickBrowserStartLevel(levels: Level[]): Level | null {
  if (!levels.length) return null;

  const maxHeight = isExtensionActiveCached() ? 1080 : 720;

  const avc = levels.filter((l) => isAvcLevel(l) && (l.height || 0) > 0);
  const avcUpToCap = avc
    .filter((l) => (l.height || 0) <= maxHeight)
    .sort((a, b) => (b.height || 0) - (a.height || 0));
  if (avcUpToCap[0]) return avcUpToCap[0];

  // No rung at/under the preferred cap — take the lowest AVC so we still avoid
  // jumping straight into 4K HEVC when possible.
  const anyAvc = [...avc].sort((a, b) => (a.height || 0) - (b.height || 0));
  if (anyAvc[0]) return anyAvc[0];

  const nonHevc = levels
    .filter(
      (l) =>
        !isHevcLevel(l) &&
        (l.height || 0) > 0 &&
        (l.height || 0) <= maxHeight,
    )
    .sort((a, b) => (b.height || 0) - (a.height || 0));
  if (nonHevc[0]) return nonHevc[0];

  const upToCap = levels
    .filter((l) => (l.height || 0) > 0 && (l.height || 0) <= maxHeight)
    .sort((a, b) => (b.height || 0) - (a.height || 0));
  if (upToCap[0]) return upToCap[0];

  return sortLevelsByQuality(levels)[0] ?? null;
}

export function makeVideoElementDisplayInterface(): DisplayInterface {
  const { emit, on, off } = makeEmitter<DisplayInterfaceEvents>();
  let source: LoadableSource | null = null;
  let hls: Hls | null = null;
  let videoElement: HTMLVideoElement | null = null;
  let containerElement: HTMLElement | null = null;
  let isFullscreen = false;
  let isPictureInPicture = false;
  let isPausedBeforeSeeking = false;
  let isSeeking = false;
  let isPausedBeforeQualityChange = true;
  let isQualitySwitching = false;
  let suppressPlaybackEvents = false;
  let qualitySwitchCleanup: (() => void) | null = null;
  let startAt = 0;
  let automaticQuality = false;
  let preferenceQuality: SourceQuality | null = null;
  let lastVolume = 1;
  let lastInferredQuality: SourceQuality | null = null;


  let audioCtx: AudioContext | null = null;
  let audioAnalyser: AnalyserNode | null = null;
  let audioStreamSource: MediaStreamAudioSourceNode | null = null;
  let audioSampleTimer: ReturnType<typeof setInterval> | null = null;
  let audioBuffer: { t: number; e: number }[] = [];
  let speechCapture: SpeechCapture | null = null;
  let audioSyncAvailable = false;
  let audioInitAttempts = 0;
  const AUDIO_BUFFER_MAX = 9000; // ~6 min at 25Hz
  const AUDIO_INIT_MAX_ATTEMPTS = 6;
  let lastValidDuration = 0; // Store the last valid duration to prevent reset during source switches
  let lastValidTime = 0; // Store the last valid time to prevent reset during source switches
  let shouldAutoplayAfterLoad = false; // Flag to track if we should autoplay after loading completes
  let qualityChangeTimeout: NodeJS.Timeout | null = null; // Timeout for debouncing rapid quality changes
  let autoplayUnstickTimer: ReturnType<typeof setTimeout> | null = null;
  let autoplayInFlight = false;
  let unmuteGestureCleanup: (() => void) | null = null;

  const languagePromises = new Map<
    string,
    (value: void | PromiseLike<void>) => void
  >();

  function isMobileBrowser(): boolean {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent;
    if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
    return ua.includes("Mac") && "ontouchend" in document;
  }

  function clearUnmuteGesture() {
    unmuteGestureCleanup?.();
    unmuteGestureCleanup = null;
  }

  function armUnmuteOnGesture() {
    clearUnmuteGesture();
    if (lastVolume <= 0) return;
    const unmute = () => {
      if (!videoElement) return;
      videoElement.muted = false;
      videoElement.volume = lastVolume;
      emit("volumechange", lastVolume);
      clearUnmuteGesture();
    };
    window.addEventListener("pointerdown", unmute, true);
    window.addEventListener("keydown", unmute, true);
    unmuteGestureCleanup = () => {
      window.removeEventListener("pointerdown", unmute, true);
      window.removeEventListener("keydown", unmute, true);
    };
  }

  function muteForAutoplay(vid: HTMLVideoElement) {
    vid.defaultMuted = true;
    vid.muted = true;
    vid.setAttribute("muted", "");
  }

  /**
   * After async scrapes the click gesture is gone, so unmuted play is blocked.
   * Start muted (always allowed), emit playing, then unmute when possible.
   */
  function tryAutoplay() {
    if (!shouldAutoplayAfterLoad || !videoElement || autoplayInFlight) return;
    autoplayInFlight = true;

    const finishOk = () => {
      shouldAutoplayAfterLoad = false;
      autoplayInFlight = false;
      if (autoplayUnstickTimer) {
        clearTimeout(autoplayUnstickTimer);
        autoplayUnstickTimer = null;
      }
      emit("play", undefined);
      emit("loading", false);
    };

    // Keep muted through play() — setVolume/init must not unmute mid-attempt.
    muteForAutoplay(videoElement);
    const playPromise = videoElement.play();
    if (playPromise === undefined) {
      finishOk();
      return;
    }

    playPromise
      .then(() => {
        finishOk();
        if (lastVolume <= 0 || !videoElement) return;

        const vid = videoElement;
        let unmuteSettled = false;
        const keepPlayingMuted = () => {
          if (unmuteSettled) return;
          unmuteSettled = true;
          vid.removeEventListener("pause", keepPlayingMuted);
          muteForAutoplay(vid);
          emit("volumechange", 0);
          vid.play().catch(() => undefined);
          armUnmuteOnGesture();
        };

        vid.addEventListener("pause", keepPlayingMuted);
        // Unmute can pause iOS — don't let that flip the UI to "tap play".
        suppressPlaybackEvents = true;
        vid.muted = false;
        vid.removeAttribute("muted");
        vid.volume = lastVolume;
        emit("volumechange", lastVolume);

        // If unmute didn't force a pause, drop the listener shortly after.
        window.setTimeout(() => {
          suppressPlaybackEvents = false;
          if (unmuteSettled) return;
          if (vid.paused) {
            keepPlayingMuted();
            return;
          }
          unmuteSettled = true;
          vid.removeEventListener("pause", keepPlayingMuted);
        }, 150);
      })
      .catch((err: unknown) => {
        autoplayInFlight = false;
        const name =
          err && typeof err === "object" && "name" in err
            ? String((err as { name: string }).name)
            : "";
        // AbortError / not ready — retry on next canplay/manifest/unstick tick.
        if (name === "AbortError" || name === "NotSupportedError") return;
        // Even muted play blocked — show the tap-to-play overlay.
        emit("pause", undefined);
        emit("loading", false);
      });
  }

  function reportLevels() {
    if (!hls) return;
    const levels = hls.levels;
    const convertedLevels = levels
      .map((v) => hlsLevelToQuality(v))
      .filter((v): v is SourceQuality => !!v);
    emit("qualities", convertedLevels);
  }

  function reportAudioTracks() {
    if (!hls) return;
    const currentLanguage = useLanguageStore.getState().language;
    const audioTracks = hls.audioTracks;
    const languageTrack = audioTracks.find((v) => v.lang === currentLanguage);
    if (languageTrack) {
      hls.audioTrack = audioTracks.indexOf(languageTrack);
    }
    const currentTrack = audioTracks?.[hls.audioTrack ?? 0];
    if (!currentTrack) return;
    emit("changedaudiotrack", {
      id: currentTrack.id.toString(),
      label: currentTrack.name,
      language: resolveAudioLanguage(currentTrack.lang, currentTrack.name),
    });
    emit(
      "audiotracks",
      hls.audioTracks.map((v) => ({
        id: v.id.toString(),
        label: v.name,
        language: resolveAudioLanguage(v.lang, v.name),
      })),
    );
  }

  /**
   * When the source/HLS playlist doesn't label quality (common on native
   * Safari HLS and some scrapers), read the decoded frame size from the
   * <video> element — that's the real resolution being shown.
   */
  function reportQualityFromVideoElement() {
    if (!videoElement) return;
    // hls.js already reports level heights — don't fight those updates.
    if (hls && hls.levels.some((l) => l.height > 0)) return;

    const height = videoElement.videoHeight;
    const quality = resolutionHeightToQuality(height);
    if (!quality || quality === lastInferredQuality) return;
    lastInferredQuality = quality;
    emit("qualities", [quality]);
    emit("changedquality", quality);
  }

  function pauseForQualitySwitch() {
    if (!videoElement) return;
    if (!isQualitySwitching) {
      isPausedBeforeQualityChange = videoElement.paused;
      isQualitySwitching = true;
    }
    emit("loading", true);
    if (!videoElement.paused) {
      suppressPlaybackEvents = true;
      try {
        videoElement.pause();
      } finally {
        suppressPlaybackEvents = false;
      }
    }
  }

  function resumeAfterQualitySwitch() {
    if (!isQualitySwitching) return;
    qualitySwitchCleanup?.();
    qualitySwitchCleanup = null;
    isQualitySwitching = false;
    emit("loading", false);
    if (!isPausedBeforeQualityChange && videoElement) {
      videoElement.play().catch(() => {
        emit("pause", undefined);
      });
    }
    isPausedBeforeQualityChange = true;
  }

  function waitForQualitySwitchReady() {
    qualitySwitchCleanup?.();
    const vid = videoElement;
    const hlsRef = hls;
    if (!vid) {
      resumeAfterQualitySwitch();
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resumeAfterQualitySwitch();
    };

    const onCanPlay = () => finish();
    const onLevelSwitched = () => {
      // New level attached — resume once the decoder has data, or immediately
      // if we already have enough buffered frames.
      if (vid.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
        finish();
        return;
      }
      vid.addEventListener("canplay", onCanPlay, { once: true });
    };

    if (hlsRef) {
      hlsRef.on(Hls.Events.LEVEL_SWITCHED, onLevelSwitched);
    }

    // Auto quality only retunes ABR — don't hold the pause for a full level swap.
    const safety = window.setTimeout(finish, automaticQuality ? 800 : 6000);

    qualitySwitchCleanup = () => {
      window.clearTimeout(safety);
      if (hlsRef) {
        hlsRef.off(Hls.Events.LEVEL_SWITCHED, onLevelSwitched);
      }
      vid.removeEventListener("canplay", onCanPlay);
    };
  }

  function setupQualityForHls() {
    if (videoElement && canPlayHlsNatively(videoElement)) {
      return; // nothing to change
    }

    if (!hls) return;
    if (!automaticQuality) {
      const sortedLevels = sortLevelsByQuality(hls.levels);
      const qualities = hlsLevelsToQualities(sortedLevels);
      const availableQuality = getPreferredQuality(qualities, {
        lastChosenQuality: preferenceQuality,
        automaticQuality,
      });
      if (availableQuality) {
        // Find the best level that matches our preferred quality
        const matchingLevels = hls.levels.filter(
          (level) => hlsLevelToQuality(level) === availableQuality,
        );
        if (matchingLevels.length > 0) {
          // Pick the highest resolution level for this quality
          const bestLevel = sortLevelsByQuality(matchingLevels)[0];
          const levelIndex = hls.levels.indexOf(bestLevel);
          if (levelIndex !== -1) {
            hls.currentLevel = levelIndex;
            hls.loadLevel = levelIndex;
          }
        }
      }
    } else {
      // Auto: start on a playable AVC rung (720p proxy / 1080p extension+desktop).
      const startLevel = pickBrowserStartLevel(hls.levels);
      const topIndex = startLevel ? hls.levels.indexOf(startLevel) : -1;
      if (topIndex !== -1) {
        hls.startLevel = topIndex;
        hls.nextLevel = topIndex;
        hls.loadLevel = topIndex;
        hls.currentLevel = topIndex;
      } else {
        hls.currentLevel = -1;
        hls.loadLevel = -1;
      }
    }

  }

  function setupSource(vid: HTMLVideoElement, src: LoadableSource) {
    hls = null;
    if (src.type === "hls") {
      if (canPlayHlsNatively(vid)) {
        vid.src = processCdnLink(src.url);
        vid.currentTime = startAt;
        return;
      }

      if (!Hls.isSupported())
        throw new Error("HLS not supported. Update your browser. 🤦‍♂️");
      if (!hls) {
        const proxiedStream =
          typeof src.url === "string" && src.url.includes("/m3u8-proxy");
        hls = new Hls({
          // Wait until we pick the start AVC rung — autoStart would race into 4K HEVC.
          autoStartLoad: false,
          // Proxied segments are slower; keep the first buffer lean for faster start.
          maxBufferLength: proxiedStream ? 30 : 120,
          maxMaxBufferLength: proxiedStream ? 60 : 240,
          abrEwmaDefaultEstimate: proxiedStream
            ? 1.5 * 1000 * 1000
            : 5 * 1000 * 1000,
          fragLoadPolicy: {
            default: {
              maxLoadTimeMs: 30 * 1000, // allow it load extra long, fragments are slow if requested for the first time on an origin
              maxTimeToFirstByteMs: 30 * 1000,
              errorRetry: {
                maxNumRetry: 10,
                retryDelayMs: 1000,
                maxRetryDelayMs: 10000,
              },
              timeoutRetry: {
                maxNumRetry: 10,
                maxRetryDelayMs: 0,
                retryDelayMs: 0,
              },
            },
          },
          renderTextTracksNatively: false,
          loader: ArtemisRetryLoader as any,
          xhrSetup: (xhr, url) => {
            if (typeof url === "string" && url.includes("erlook")) {
              try { xhr.overrideMimeType("application/octet-stream"); } catch {}
            }
          },
        });
        const exceptions = [
          "Failed to execute 'appendBuffer' on 'SourceBuffer': This SourceBuffer has been removed from the parent media source.",
        ];
        let mediaRecoveryAttempts = 0;
        let fragSkipAttempts = 0;
        const MAX_FRAG_SKIPS = 5;
        hls?.on(Hls.Events.ERROR, (event, data) => {
          console.error("HLS error", data);

          // Extract detailed HLS error information
          const hlsErrorInfo = {
            details: data.details,
            fatal: data.fatal,
            level: data.level,
            levelDetails: (data as any).levelDetails
              ? {
                  url: (data as any).levelDetails.url,
                  width: (data as any).levelDetails.width,
                  height: (data as any).levelDetails.height,
                  bitrate: (data as any).levelDetails.bitrate,
                }
              : undefined,
            frag: data.frag
              ? {
                  url: data.frag.url,
                  baseurl: data.frag.baseurl,
                  duration: data.frag.duration,
                  start: data.frag.start,
                  sn: data.frag.sn,
                }
              : undefined,
            type: data.type,
            url: (data as any).url,
          };

          // LookMovie/AES CDNs sometimes return an empty/corrupt TS segment.
          // Skip past a few; if the whole stream is unreadable, fail out so
          // playback recovery can try another source instead of looping forever.
          if (
            data.fatal &&
            hls &&
            // String form — enum constant not present on all hls.js typings.
            data.details === "fragParsingError" &&
            fragSkipAttempts < MAX_FRAG_SKIPS
          ) {
            const frag = data.frag;
            if (frag && typeof frag.start === "number") {
              const skipTo = frag.start + (frag.duration || 2) + 0.05;
              fragSkipAttempts += 1;
              console.warn(
                "[hls] skipping unreadable fragment",
                frag.sn,
                "→",
                skipTo,
                `(${fragSkipAttempts}/${MAX_FRAG_SKIPS})`,
              );
              try {
                hls.startLoad(skipTo);
                return;
              } catch (err) {
                console.warn("[hls] fragment skip failed", err);
              }
            }
          }

          if (
            data.fatal &&
            hls &&
            data.type === Hls.ErrorTypes.MEDIA_ERROR &&
            mediaRecoveryAttempts < 2
          ) {
            mediaRecoveryAttempts += 1;
            console.warn("[hls] attempting media error recovery", mediaRecoveryAttempts);
            try {
              hls.recoverMediaError();
              return;
            } catch (err) {
              console.warn("[hls] media recovery failed", err);
            }
          }

          // Always surface fatal HLS failures after recovery attempts.
          // Do not require frag.baseurl === playlist URL — proxied Reyna/Orbit
          // streams use a different origin for segments than the m3u8, so that
          // check silently dropped fatal errors and left hls.js retrying forever.
          if (data.fatal) {
            const errMessage = data.error?.message || data.details || "HLS fatal error";
            if (exceptions.includes(errMessage)) return;
            emit("error", {
              message:
                data.details === "manifestLoadError"
                  ? "Failed to load HLS manifest"
                  : errMessage,
              stackTrace: data.error?.stack || "",
              errorName:
                data.details === "manifestLoadError"
                  ? data.error?.name || "ManifestLoadError"
                  : data.error?.name || "HlsFatalError",
              type: "hls",
              hls: hlsErrorInfo,
            });
          } else if (data.details === "manifestLoadError") {
            // Non-fatal manifest failures still break playback — surface them.
            emit("error", {
              message: "Failed to load HLS manifest",
              stackTrace: data.error?.stack || "",
              errorName: data.error?.name || "ManifestLoadError",
              type: "hls",
              hls: hlsErrorInfo,
            });
          }
        });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (!hls) return;
          reportLevels();
          setupQualityForHls();
          reportAudioTracks();
          hls.startLoad();
          // Start playback once the manifest is ready (gesture is already gone).
          tryAutoplay();
        });
        hls.on(Hls.Events.MANIFEST_LOADED, () => {
          if (!hls) return;

          if (isExtensionActiveCached()) {
            hls.on(Hls.Events.LEVEL_LOADED, async (_, data) => {
              const hosts: string[] = [];
              for (const frag of data.details.fragments) {
                try {
                  hosts.push(new URL(frag.url).hostname);
                } catch {
                  // ignore
                }
                const keyUri = (frag as { decryptdata?: { uri?: string } })
                  .decryptdata?.uri;
                if (keyUri) {
                  try {
                    hosts.push(new URL(keyUri, data.details.url).hostname);
                  } catch {
                    // ignore
                  }
                }
              }
              const chunkUrls = [...new Set(hosts)];

              await setDomainRule({
                ruleId: RULE_IDS.SET_DOMAINS_HLS,
                targetDomains: chunkUrls,
                requestHeaders: {
                  ...src.preferredHeaders,
                  ...src.headers,
                },
              });
            });
            hls.on(Hls.Events.AUDIO_TRACK_LOADED, async (_, data) => {
              const chunkUrlsDomains = data.details.fragments.map(
                (v) => new URL(v.url).hostname,
              );
              const chunkUrls = [...new Set(chunkUrlsDomains)];

              await setDomainRule({
                ruleId: RULE_IDS.SET_DOMAINS_HLS_AUDIO,
                targetDomains: chunkUrls,
                requestHeaders: {
                  ...src.preferredHeaders,
                  ...src.headers,
                },
              });
            });
          }
        });
        hls.on(Hls.Events.LEVEL_SWITCHED, () => {
          if (!hls) return;

          // Don't process level switched events during debounced quality changes
          if (qualityChangeTimeout) return;

          const currentLevel = hls.levels[hls.currentLevel];
          const currentQuality = hlsLevelToQuality(currentLevel);

          if (automaticQuality) {
            // Only emit quality changes when automatic quality is enabled
            emit("changedquality", currentQuality);
          } else {
            // For manual quality selection, emit the user's preferred quality
            // This ensures the UI shows the selected quality, not the actual playing quality
            emit("changedquality", preferenceQuality);
          }
        });
        hls.on(Hls.Events.SUBTITLE_TRACK_LOADED, () => {
          for (const [lang, resolve] of languagePromises) {
            const track = hls?.subtitleTracks.find((t) => t.lang === lang);
            if (track) {
              resolve();
              languagePromises.delete(lang);
              break;
            }
          }
        });
      }

      hls.attachMedia(vid);
      hls.loadSource(processCdnLink(src.url));
      vid.currentTime = startAt;
      return;
    }

    vid.src = processCdnLink(src.url);
    vid.currentTime = startAt;
  }

  function webkitPresentationModeChange() {
    if (!videoElement) return;
    const webkitPlayer = videoElement as any;
    const isInWebkitPip =
      webkitPlayer.webkitPresentationMode === "picture-in-picture";
    isPictureInPicture = isInWebkitPip;
    // Use native tracks in WebKit PiP mode for iOS compatibility
    emit("needstrack", isInWebkitPip);

    // On iOS, entering PiP may allow autoplay that was previously blocked
    if (isInWebkitPip && videoElement.paused && shouldAutoplayAfterLoad) {
      shouldAutoplayAfterLoad = false;
      videoElement.play().catch(() => {
        // If still blocked, emit pause to show play button
        emit("pause", undefined);
      });
    }
  }

  function setSource() {
    if (!videoElement || !source) return;
    if (shouldAutoplayAfterLoad) muteForAutoplay(videoElement);
    setupSource(videoElement, source);

    videoElement.addEventListener("play", () => {
      emit("play", undefined);
      emit("loading", false);
    });
    videoElement.addEventListener("error", () => {
      const err = videoElement?.error ?? null;
      const errorDetails = getMediaErrorDetails(err);
      emit("error", {
        errorName: errorDetails.name,
        key: errorDetails.key,
        type: "htmlvideo",
      });
    });
    videoElement.addEventListener("playing", () => {
      emit("play", undefined);
      initAudioAnalysis();
      reportQualityFromVideoElement();
    });
    videoElement.addEventListener("pause", () => {
      if (suppressPlaybackEvents) return;
      emit("pause", undefined);
    });
    videoElement.addEventListener("loadedmetadata", () => {
      if (
        source?.type === "hls" &&
        videoElement &&
        canPlayHlsNatively(videoElement)
      ) {
        // Native HLS often can't enumerate levels — infer from decoded size.
        const inferred = resolutionHeightToQuality(videoElement.videoHeight);
        if (inferred) {
          lastInferredQuality = inferred;
          emit("qualities", [inferred]);
          emit("changedquality", inferred);
        } else {
          emit("qualities", ["unknown"]);
          emit("changedquality", "unknown");
        }
      } else {
        reportQualityFromVideoElement();
      }
      // Only emit duration if it's a valid value (> 0) to prevent progress reset during source switches
      const duration = videoElement?.duration ?? 0;
      if (duration > 0) {
        lastValidDuration = duration;
        emit("duration", duration);
      } else if (lastValidDuration > 0) {
        // Keep the last valid duration if the new one is invalid
        emit("duration", lastValidDuration);
      }
      // Native HLS on iOS may not fire canplay until play() — try early.
      tryAutoplay();
    });
    videoElement.addEventListener("canplay", () => {
      reportQualityFromVideoElement();
      tryAutoplay();
      // Keep the spinner while muted autoplay is still pending — clearing
      // loading here flashed the idle play button for a frame.
      if (!shouldAutoplayAfterLoad && videoElement?.paused) {
        emit("loading", false);
      }
    });
    videoElement.addEventListener("waiting", () => {
      // Don't treat pre-play buffering as a stuck loading state — that hid the
      // play button when autoplay was blocked by the browser.
      if (videoElement && !videoElement.paused) {
        emit("loading", true);
      }
    });
    videoElement.addEventListener("volumechange", () =>
      emit(
        "volumechange",
        videoElement?.muted ? 0 : (videoElement?.volume ?? 0),
      ),
    );
    videoElement.addEventListener("timeupdate", () => {
      const currentTime = videoElement?.currentTime ?? 0;
      // Always emit time updates when seeking to prevent subtitle freezing
      // Also emit when progressing forward or when time changes significantly
      // This prevents time from resetting to 0 during source switches
      if (
        currentTime >= lastValidTime ||
        isSeeking ||
        Math.abs(currentTime - lastValidTime) > 0.1
      ) {
        lastValidTime = currentTime;
        emit("time", currentTime);
      }
    });
    videoElement.addEventListener("resize", () => {
      reportQualityFromVideoElement();
    });
    videoElement.addEventListener("progress", () => {
      if (videoElement) {
        const bufferedTime = handleBuffered(
          videoElement.currentTime,
          videoElement.buffered,
        );
        emit("buffered", bufferedTime);

        // Check if we now have enough buffer to stop loading
        const hasEnoughBuffer = (() => {
          const buffered = videoElement.buffered;
          if (buffered.length === 0) return false;

          const currentTime = videoElement.currentTime ?? 0;
          // Find the buffered range that contains current time
          for (let i = 0; i < buffered.length; i += 1) {
            if (
              currentTime >= buffered.start(i) &&
              currentTime <= buffered.end(i)
            ) {
              const bufferedAhead = buffered.end(i) - currentTime;
              return bufferedAhead >= 5; // At least 5 seconds buffered ahead
            }
          }
          return false;
        })();

        // If we're still loading but now have enough buffer, stop loading
        // This handles cases where canplay fired with insufficient buffer
        if (hasEnoughBuffer && videoElement.readyState >= 3) {
          emit("loading", false);
        }
      }
    });
    videoElement.addEventListener("webkitendfullscreen", () => {
      isFullscreen = false;
      emit("fullscreen", isFullscreen);
      if (!isFullscreen) emit("needstrack", false);
    });
    videoElement.addEventListener(
      "webkitpresentationmodechanged",
      webkitPresentationModeChange,
    );
    videoElement.addEventListener("ratechange", () => {
      if (videoElement) emit("playbackrate", videoElement.playbackRate);
    });

    videoElement.addEventListener("durationchange", () => {
      // Only emit duration if it's a valid value (> 0) to prevent progress reset during source switches
      const duration = videoElement?.duration ?? 0;
      if (duration > 0) {
        lastValidDuration = duration;
        emit("duration", duration);
      } else if (lastValidDuration > 0) {
        // Keep the last valid duration if the new one is invalid
        emit("duration", lastValidDuration);
      }
    });
  }

  function teardownAudioAnalysis() {
    if (audioSampleTimer) {
      clearInterval(audioSampleTimer);
      audioSampleTimer = null;
    }
    try {
      speechCapture?.stop();
    } catch {
      // ignore
    }
    speechCapture = null;
    try {
      audioStreamSource?.disconnect();
    } catch {
      // ignore
    }
    if (audioCtx) audioCtx.close().catch(() => {});
    audioStreamSource = null;
    audioAnalyser = null;
    audioCtx = null;
    audioBuffer = [];
    audioSyncAvailable = false;
    audioInitAttempts = 0;
  }


  function initAudioAnalysis() {
    if (audioAnalyser || !videoElement) return; 
    if (audioInitAttempts >= AUDIO_INIT_MAX_ATTEMPTS) return;
  
    if (!usePreferencesStore.getState().enableAutoSubtitleSync) {
      audioInitAttempts = AUDIO_INIT_MAX_ATTEMPTS;
      return;
    }
    audioInitAttempts += 1;
    try {
      const el = videoElement as any;
      const stream: MediaStream | undefined =
        el.captureStream?.() ?? el.mozCaptureStream?.();
      if (!stream || stream.getAudioTracks().length === 0) return; 

      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) {
        audioInitAttempts = AUDIO_INIT_MAX_ATTEMPTS;
        return;
      }
      audioCtx = new Ctx();
      audioCtx.resume?.().catch(() => {});
      audioStreamSource = audioCtx.createMediaStreamSource(stream);
      audioAnalyser = audioCtx.createAnalyser();
      audioAnalyser.fftSize = 2048;
      
      audioStreamSource.connect(audioAnalyser);

     
      if (usePreferencesStore.getState().enableAutoSubtitleSync) {
        try {
          speechCapture = new SpeechCapture(
            audioCtx,
            audioStreamSource,
            () => videoElement?.currentTime ?? 0,
          );
          speechCapture.start();
        } catch {
          speechCapture = null;
        }
      }

      const freqBuf = new Uint8Array(audioAnalyser.frequencyBinCount);
      const res = audioCtx.sampleRate / audioAnalyser.fftSize;
      const lowBin = Math.max(1, Math.floor(300 / res)); 
      const highBin = Math.min(freqBuf.length - 1, Math.ceil(3400 / res));
      audioSampleTimer = setInterval(() => {
        if (!videoElement || !audioAnalyser) return;
        if (videoElement.paused || isSeeking) return;
        audioAnalyser.getByteFrequencyData(freqBuf);
        let sum = 0;
        for (let i = lowBin; i <= highBin; i += 1) sum += freqBuf[i];
       
        const e = sum / ((highBin - lowBin + 1) * 255);
        if (e > 1e-3) audioSyncAvailable = true;
        audioBuffer.push({ t: videoElement.currentTime, e });
        if (audioBuffer.length > AUDIO_BUFFER_MAX) {
          audioBuffer.splice(0, audioBuffer.length - AUDIO_BUFFER_MAX);
        }
      }, 40);
    } catch {
      // SecurityError (tainted) or unsupported — give up permanently.
      teardownAudioAnalysis();
      audioInitAttempts = AUDIO_INIT_MAX_ATTEMPTS;
    }
  }

  function unloadSource() {
    // Clear any pending quality change timeout
    if (qualityChangeTimeout) {
      clearTimeout(qualityChangeTimeout);
      qualityChangeTimeout = null;
    }
    qualitySwitchCleanup?.();
    qualitySwitchCleanup = null;
    isQualitySwitching = false;
    suppressPlaybackEvents = false;
    autoplayInFlight = false;
    clearUnmuteGesture();

    teardownAudioAnalysis();

    if (videoElement) {
      videoElement.removeAttribute("src");
      videoElement.load();
    }
    if (hls) {
      hls.destroy();
      hls = null;
    }
    // Reset the last valid duration and time when unloading source
    lastValidDuration = 0;
    lastValidTime = 0;
  }

  function destroyVideoElement() {
    unloadSource();
    if (videoElement) {
      videoElement = null;
    }
    // Clear any remaining timeout
    if (qualityChangeTimeout) {
      clearTimeout(qualityChangeTimeout);
      qualityChangeTimeout = null;
    }
  }

  function fullscreenChange() {
    isFullscreen =
      !!document.fullscreenElement || // other browsers
      !!(document as any).webkitFullscreenElement; // safari
    emit("fullscreen", isFullscreen);
    if (!isFullscreen) emit("needstrack", false);

    // On iOS, entering fullscreen may allow autoplay that was previously blocked
    if (
      isFullscreen &&
      videoElement &&
      videoElement.paused &&
      shouldAutoplayAfterLoad
    ) {
      shouldAutoplayAfterLoad = false;
      videoElement.play().catch(() => {
        // If still blocked, emit pause to show play button
        emit("pause", undefined);
      });
    }
  }
  fscreen.addEventListener("fullscreenchange", fullscreenChange);

  function pictureInPictureChange() {
    isPictureInPicture = !!document.pictureInPictureElement;
    // Use native tracks in PiP mode for better compatibility with iOS and other platforms
    emit("needstrack", isPictureInPicture);

    // Entering PiP may allow autoplay that was previously blocked
    if (
      isPictureInPicture &&
      videoElement &&
      videoElement.paused &&
      shouldAutoplayAfterLoad
    ) {
      shouldAutoplayAfterLoad = false;
      videoElement.play().catch(() => {
        // If still blocked, emit pause to show play button
        emit("pause", undefined);
      });
    }
  }

  document.addEventListener("enterpictureinpicture", pictureInPictureChange);
  document.addEventListener("leavepictureinpicture", pictureInPictureChange);

  return {
    on,
    off,
    getType() {
      return "web";
    },
    destroy: () => {
      destroyVideoElement();
      fscreen.removeEventListener("fullscreenchange", fullscreenChange);
      document.removeEventListener(
        "enterpictureinpicture",
        pictureInPictureChange,
      );
      document.removeEventListener(
        "leavepictureinpicture",
        pictureInPictureChange,
      );
    },
    load(ops) {
      const hadActiveSource = !!source && !!videoElement;
      const wasPlaying = videoElement ? !videoElement.paused : false;

      // Pause immediately on mid-playback reloads (e.g. MP4 quality switch)
      // so the old stream doesn't keep playing while the new one loads.
      if (videoElement && !videoElement.paused) {
        suppressPlaybackEvents = true;
        try {
          videoElement.pause();
        } finally {
          suppressPlaybackEvents = false;
        }
      }

      if (!ops.source) unloadSource();
      automaticQuality = ops.automaticQuality;
      preferenceQuality = ops.preferredQuality;
      lastInferredQuality = null;
      source = ops.source;
      emit("loading", true);
      startAt = ops.startAt;
      if (hadActiveSource && ops.source) {
        shouldAutoplayAfterLoad = wasPlaying;
      } else {
        // Fresh start / resume: honor autoplay preference
        shouldAutoplayAfterLoad =
          usePreferencesStore.getState().enableAutoplay !== false;
      }
      setSource();

      // Mobile native HLS can sit paused without canplay. Retry muted play;
      // never treat an in-flight play() as "blocked" (that flashed the button).
      if (autoplayUnstickTimer) clearTimeout(autoplayUnstickTimer);
      if (isMobileBrowser()) {
        let kicks = 0;
        const kick = () => {
          autoplayUnstickTimer = null;
          if (!shouldAutoplayAfterLoad) return;
          if (!videoElement) return;
          if (!videoElement.paused) return;
          if (autoplayInFlight) {
            autoplayUnstickTimer = setTimeout(kick, 800);
            return;
          }
          kicks += 1;
          tryAutoplay();
          if (kicks < 5) {
            autoplayUnstickTimer = setTimeout(kick, 1200);
            return;
          }
          if (
            shouldAutoplayAfterLoad &&
            videoElement.paused &&
            !autoplayInFlight
          ) {
            emit("pause", undefined);
            emit("loading", false);
          }
        };
        autoplayUnstickTimer = setTimeout(kick, 1200);
      }
    },
    changeQuality(newAutomaticQuality, newPreferredQuality) {
      if (source?.type !== "hls") return;

      // Clear any pending quality change to prevent race conditions
      if (qualityChangeTimeout) {
        clearTimeout(qualityChangeTimeout);
        qualityChangeTimeout = null;
      }
      qualitySwitchCleanup?.();
      qualitySwitchCleanup = null;

      automaticQuality = newAutomaticQuality;
      preferenceQuality = newPreferredQuality;

      // Freeze playback until the new level is ready — switching while playing
      // causes stutter / double-decode weirdness.
      pauseForQualitySwitch();

      // Debounce quality changes to prevent rapid switching issues
      qualityChangeTimeout = setTimeout(() => {
        qualityChangeTimeout = null;
        if (!hls || !videoElement) {
          resumeAfterQualitySwitch();
          return;
        }

        const previousLevel = hls.currentLevel;
        setupQualityForHls();

        // Manual pick landed on the same level — nothing to wait for.
        if (
          !automaticQuality &&
          previousLevel !== -1 &&
          hls.currentLevel === previousLevel
        ) {
          resumeAfterQualitySwitch();
          return;
        }

        waitForQualitySwitchReady();
      }, 100); // 100ms debounce delay
    },

    processVideoElement(video) {
      destroyVideoElement();
      videoElement = video;
      muteForAutoplay(video);
      setSource();
      this.setVolume(lastVolume);
    },
    processContainerElement(container) {
      containerElement = container;
    },
    setMeta() {},
    setCaption() {},

    pause() {
      videoElement?.pause();
    },
    play() {
      shouldAutoplayAfterLoad = false;
      autoplayInFlight = false;
      if (autoplayUnstickTimer) {
        clearTimeout(autoplayUnstickTimer);
        autoplayUnstickTimer = null;
      }
      if (audioCtx?.state === "suspended") audioCtx.resume().catch(() => {});
      clearUnmuteGesture();
      if (videoElement && lastVolume > 0) {
        videoElement.muted = false;
        videoElement.removeAttribute("muted");
        videoElement.volume = lastVolume;
        emit("volumechange", lastVolume);
      }
      videoElement?.play();
      initAudioAnalysis();
    },
    setSeeking(active) {
      if (active === isSeeking) return;
      isSeeking = active;

      // if it was playing when starting to seek, play again
      if (!active) {
        if (!isPausedBeforeSeeking) this.play();
        return;
      }

      isPausedBeforeSeeking = videoElement?.paused ?? true;
      this.pause();
    },
    setTime(t) {
      if (!videoElement) return;
      // clamp time between 0 and max duration
      let time = Math.min(t, videoElement.duration);
      time = Math.max(0, time);

      if (Number.isNaN(time)) return;
      emit("time", time);
      videoElement.currentTime = time;
    },
    async setVolume(v) {
      // clamp time between 0 and 1
      let volume = Math.min(v, 1);
      volume = Math.max(0, volume);

      // actually set
      lastVolume = v;
      if (!videoElement) return;

      // While kicking off autoplay, stay muted so setVolume(init) can't undo it.
      if (shouldAutoplayAfterLoad && volume > 0) {
        videoElement.volume = volume;
        videoElement.muted = true;
        emit("volumechange", volume);
        return;
      }

      videoElement.muted = volume === 0; // Muted attribute is always supported

      // update state
      const isChangeable = await canChangeVolume();
      if (isChangeable) {
        videoElement.volume = volume;
      } else {
        // For browsers where it can't be changed
        emit("volumechange", volume === 0 ? 0 : 1);
      }
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
        return;
      }
      if (canWebkitFullscreen()) {
        if (videoElement) {
          emit("needstrack", true);
          (videoElement as any).webkitEnterFullscreen();
        }
      }
    },
    togglePictureInPicture() {
      if (!videoElement) return;
      if (canWebkitPictureInPicture()) {
        const webkitPlayer = videoElement as any;
        webkitPlayer.webkitSetPresentationMode(
          webkitPlayer.webkitPresentationMode === "picture-in-picture"
            ? "inline"
            : "picture-in-picture",
        );
      }
      if (canPictureInPicture()) {
        if (videoElement !== document.pictureInPictureElement) {
          videoElement.requestPictureInPicture();
        } else {
          document.exitPictureInPicture();
        }
      }
    },
    setPlaybackRate(rate) {
      if (videoElement) videoElement.playbackRate = rate;
    },
    getCaptionList() {
      return (
        hls?.subtitleTracks.map((track) => {
          return {
            id: track.id.toString(),
            language: track.lang ?? "unknown",
            url: track.url,
            type: "vtt", // HLS captions are typically VTT format
            needsProxy: false,
            hls: true,
          };
        }) ?? []
      );
    },
    getSubtitleTracks() {
      return hls?.subtitleTracks ?? [];
    },
    getAudioActivity() {

      if (speechCapture?.isReady()) return speechCapture.getActivitySamples();
      return audioBuffer;
    },
    getCodecsHint() {
      // hls.js probes real codec fourccs from the actual segment bytes
      // during demuxing, even when the manifest's #EXT-X-STREAM-INF line
      // omits CODECS= entirely — this is ground truth, unlike a
      // resolution-keyed guess. Used to hand Chromecast's receiver (which
      // never runs hls.js and needs CODECS in the manifest text) real data
      // instead of a server-side guess.
      const level = hls?.levels?.[hls.currentLevel];
      if (!level) return null;
      const codecs = [level.videoCodec, level.audioCodec]
        .filter((c): c is string => !!c)
        .join(",");
      return codecs || null;
    },
    getResolvedVariantUrl() {
      // The currently-active level's OWN media-playlist URL (already
      // resolved to an absolute /hls?v=<token> through artemis) — fetching
      // this directly returns a plain media playlist with real CDN segment
      // URLs already in it (confirmed live), no further master/variant
      // negotiation needed. Handing this to Chromecast instead of the master
      // means Shaka Player never has to do its own variant-selection fetch
      // through artemis at all — it just gets one flat playlist.
      const level = hls?.levels?.[hls.currentLevel];
      return level?.uri ?? null;
    },
    isAudioSyncAvailable() {
      return audioSyncAvailable || !!speechCapture?.isReady();
    },
    getAudioWindow(durationSec: number) {
      if (audioCtx && audioCtx.state === "suspended") {
        audioCtx.resume().catch(() => {});
      }
      return speechCapture?.getAudioWindow(durationSec) ?? null;
    },
    async setSubtitlePreference(lang) {
      // default subtitles are already loaded by hls.js
      const track = hls?.subtitleTracks.find((t) => t.lang === lang);
      if (track?.details !== undefined) return Promise.resolve();

      // need to wait a moment before hls loads the subtitles
      const promise = new Promise<void>((resolve, reject) => {
        languagePromises.set(lang, resolve);

        // reject after some time, if hls.js fails to load the subtitles
        // for any reason
        setTimeout(() => {
          reject();
          languagePromises.delete(lang);
        }, 5000);
      });
      hls?.setSubtitleOption({ lang });
      return promise;
    },
    changeAudioTrack(track) {
      if (!hls) return;
      const audioTrack = hls?.audioTracks.find(
        (t) => t.id.toString() === track.id,
      );
      if (!audioTrack) return;
      hls.audioTrack = hls.audioTracks.indexOf(audioTrack);
      emit("changedaudiotrack", {
        id: audioTrack.id.toString(),
        label: audioTrack.name,
        language: resolveAudioLanguage(audioTrack.lang, audioTrack.name),
      });
    },
  };
}
