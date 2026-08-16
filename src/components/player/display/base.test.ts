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
    fresh.video.dispatchEvent(new Event("canplay"));

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
});
