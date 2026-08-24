import { DisplayInterface } from "@/components/player/display/displayInterface";
import { playerStatus } from "@/stores/player/slices/source";
import { MakeSlice } from "@/stores/player/slices/types";

export interface DisplaySlice {
  display: DisplayInterface | null;
  setDisplay(display: DisplayInterface | null): void;
  reset(): void;
}

export const createDisplaySlice: MakeSlice<DisplaySlice> = (set, get) => ({
  display: null,
  setDisplay(newDisplay: DisplayInterface | null) {
    const display = get().display;
    if (display) display.destroy();

    if (!newDisplay) {
      set((s) => {
        s.display = null;
      });
      return;
    }

    // make display events update the state
    newDisplay.on("pause", () =>
      set((s) => {
        s.mediaPlaying.isPaused = true;
        s.mediaPlaying.isPlaying = false;
      }),
    );
    newDisplay.on("play", () => {
      set((s) => {
        s.mediaPlaying.hasPlayedOnce = true;
        s.mediaPlaying.isPaused = false;
        s.mediaPlaying.isPlaying = true;
      });
      // Quality hops keep the previous stream until this one is stable. Clearing
      // on the first loading=false is too early — Nova can buffer a fragment
      // then die on 1080 through the proxy, which used to dump into the source
      // checker instead of restoring the working stream.
      const fallback = get().qualityHopFallback;
      if (!fallback) return;
      const expiresAt = fallback.expiresAt;
      window.setTimeout(() => {
        const still = get().qualityHopFallback;
        if (!still || still.expiresAt !== expiresAt) return;
        if (!get().mediaPlaying.isPlaying || get().mediaPlaying.isLoading) return;
        if (get().status !== playerStatus.PLAYING) return;
        set((s) => {
          if (s.qualityHopFallback?.expiresAt === expiresAt) {
            s.qualityHopFallback = null;
          }
        });
      }, 8_000);
    });
    newDisplay.on("fullscreen", (isFullscreen) =>
      set((s) => {
        s.interface.isFullscreen = isFullscreen;
      }),
    );
    newDisplay.on("time", (time) =>
      set((s) => {
        s.progress.time = time;
      }),
    );
    newDisplay.on("volumechange", (vol) =>
      set((s) => {
        s.mediaPlaying.volume = vol;
      }),
    );
    newDisplay.on("duration", (duration) => {
      set((s) => {
        s.progress.duration = duration;
      });
      // The only thing a stream tells us about which title it holds is how long
      // it is, so this is where a source serving another video gets caught.
      get().reportStreamDuration(duration);
    });
    newDisplay.on("buffered", (buffered) =>
      set((s) => {
        s.progress.buffered = buffered;
      }),
    );
    newDisplay.on("loading", (isLoading) =>
      set((s) => {
        s.mediaPlaying.isLoading = isLoading;
      }),
    );
    newDisplay.on("qualities", (qualities) => {
      set((s) => {
        s.qualities = qualities;
      });
    });
    newDisplay.on("changedquality", (quality) => {
      set((s) => {
        s.currentQuality = quality;
      });
    });
    newDisplay.on("audiotracks", (audioTracks) => {
      set((s) => {
        s.audioTracks = audioTracks;
      });
    });
    newDisplay.on("changedaudiotrack", (audioTrack) => {
      set((s) => {
        s.currentAudioTrack = audioTrack;
      });
    });
    newDisplay.on("needstrack", (needsTrack) => {
      set((s) => {
        s.caption.asTrack = needsTrack;
      });
    });
    newDisplay.on("playbackrate", (rate) => {
      set((s) => {
        s.mediaPlaying.playbackRate = rate;
      });
    });
    newDisplay.on("error", (err) => {
      // A quality the user picked from another source failing is not the same
      // as losing the stream they were watching. Put the old one back and stay
      // in the player rather than falling through to the error screen, which
      // auto-resumes into a full re-scrape.
      if (get().restoreQualityHopFallback()) return;
      set((s) => {
        s.status = playerStatus.PLAYBACK_ERROR;
        s.interface.error = err;
      });
    });

    set((s) => {
      s.display = newDisplay;
    });
  },
  reset() {
    get().display?.load({
      source: null,
      startAt: 0,
      automaticQuality: false,
      preferredQuality: null,
    });
    set((s) => {
      s.status = playerStatus.IDLE;
      s.meta = null;
      s.embedId = null;
      s.sourceId = null;
      s.thumbnails.images = [];
      s.progress.time = 0;
      s.progress.duration = 0;
    });
  },
});
