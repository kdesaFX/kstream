/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it, vi } from "vitest";

import { makeVideoElementDisplayInterface } from "@/components/player/display/base";
import type { LoadableSource } from "@/stores/player/utils/qualities";

function mp4(url: string): LoadableSource {
  return { type: "mp4", url };
}

function loadOps(source: LoadableSource) {
  return {
    source,
    startAt: 0,
    automaticQuality: false,
    preferredQuality: null,
  };
}

/** jsdom leaves the media methods unimplemented, so stand them in. */
function stubVideo() {
  const video = document.createElement("video");
  const play = vi.fn(() => Promise.resolve());
  Object.assign(video, { play, pause: vi.fn(), load: vi.fn() });
  return { video, play };
}

/** jsdom's readonly playback state, made writable for the test. */
function setPlaybackState(
  video: HTMLVideoElement,
  state: { paused?: boolean; readyState?: number; currentTime?: number },
) {
  for (const [key, value] of Object.entries(state)) {
    Object.defineProperty(video, key, {
      value,
      configurable: true,
      writable: true,
    });
  }
}

describe("video display autoplay on load", () => {
  it("autoplays a replacement loaded after the previous stream was unloaded", () => {
    const display = makeVideoElementDisplayInterface();

    const dead = stubVideo();
    display.processVideoElement(dead.video);
    display.load(loadOps(mp4("https://example.com/dead.mp4")));

    // The stream fails, so the player leaves PLAYING and the <video> unmounts.
    display.unload?.();

    // Recovery scrapes another source and returns to PLAYING, which loads the
    // stream first and only then mounts the new element.
    display.load(loadOps(mp4("https://example.com/working.mp4")));
    const fresh = stubVideo();
    display.processVideoElement(fresh.video);
    // Some providers only signal the first decoded frame after a resume,
    // without a subsequent canplay event.
    fresh.video.dispatchEvent(new Event("loadeddata"));

    expect(fresh.play).toHaveBeenCalled();
  });

  it("leaves a paused stream paused when swapping in place", () => {
    const display = makeVideoElementDisplayInterface();

    const { video, play } = stubVideo();
    display.processVideoElement(video);
    display.load(loadOps(mp4("https://example.com/first.mp4")));

    // No unload: the element stays mounted and paused, as when picking another
    // quality without playing. That choice should not start playback.
    display.load(loadOps(mp4("https://example.com/second.mp4")));
    video.dispatchEvent(new Event("canplay"));

    expect(play).not.toHaveBeenCalled();
  });

  it("retries muted autoplay when sound is rejected after scraping", async () => {
    const display = makeVideoElementDisplayInterface();
    const { video, play } = stubVideo();
    play
      .mockRejectedValueOnce(
        Object.assign(new Error("Sound autoplay blocked"), {
          name: "NotAllowedError",
        }),
      )
      .mockResolvedValueOnce(undefined);
    display.processVideoElement(video);
    display.load(loadOps(mp4("https://example.com/resumed.mp4")));

    video.dispatchEvent(new Event("loadeddata"));
    await vi.waitFor(() => expect(play).toHaveBeenCalledTimes(2));

    expect(video.muted).toBe(true);
  });
});

describe("video display spinner", () => {
  /** Get playing, with the spinner raised by the buffer flush a seek causes. */
  function playingThenStalled() {
    const display = makeVideoElementDisplayInterface();
    const loading: boolean[] = [];
    display.on("loading", (v) => loading.push(v));

    const { video } = stubVideo();
    display.processVideoElement(video);
    display.load(loadOps(mp4("https://example.com/stream.mp4")));
    setPlaybackState(video, { paused: false, readyState: 4, currentTime: 30 });
    video.dispatchEvent(new Event("canplay"));
    video.dispatchEvent(new Event("timeupdate"));
    video.dispatchEvent(new Event("waiting"));
    expect(loading.at(-1)).toBe(true);

    return { display, video, loading };
  }

  it("comes down when the element resumes after a stall", () => {
    const { video, loading } = playingThenStalled();

    video.dispatchEvent(new Event("playing"));

    expect(loading.at(-1)).toBe(false);
  });

  it("comes down after seeking back into buffered video", () => {
    const { video, loading } = playingThenStalled();

    // No `playing` and no download progress: everything needed is already
    // buffered, which is exactly the case that used to leave it spinning.
    setPlaybackState(video, { currentTime: 20 });
    video.dispatchEvent(new Event("seeked"));

    expect(loading.at(-1)).toBe(false);
  });

  it("comes down once the picture is moving, whatever the events said", () => {
    const { video, loading } = playingThenStalled();

    setPlaybackState(video, { currentTime: 31 });
    video.dispatchEvent(new Event("timeupdate"));

    expect(loading.at(-1)).toBe(false);
  });

  it("stays up while a stalled stream makes no progress", () => {
    const { video, loading } = playingThenStalled();

    setPlaybackState(video, { readyState: 2 });
    video.dispatchEvent(new Event("timeupdate"));
    video.dispatchEvent(new Event("seeked"));

    expect(loading.at(-1)).toBe(true);
  });
});
