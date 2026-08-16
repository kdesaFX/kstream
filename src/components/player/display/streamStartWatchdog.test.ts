/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import { streamStartVerdict } from "@/components/player/display/streamStartWatchdog";

const TIMEOUT = 30000;

describe("stream start watchdog", () => {
  it("calls a stream dead once it never buffers in time", () => {
    expect(
      streamStartVerdict({
        readyState: 0,
        paused: true,
        autoplayPending: true,
        loading: true,
        msRemaining: 0,
      }),
    ).toBe("timeout");
  });

  it("waits out the grace period first", () => {
    expect(
      streamStartVerdict({
        readyState: 0,
        paused: true,
        autoplayPending: true,
        loading: true,
        msRemaining: TIMEOUT - 1000,
      }),
    ).toBe("waiting");
  });

  it("leaves a stream alone once it can play", () => {
    expect(
      streamStartVerdict({
        readyState: 3,
        paused: false,
        autoplayPending: false,
        loading: false,
        msRemaining: -5000,
      }),
    ).toBe("alive");
  });

  it("does not fault a stream buffered but held at the play button", () => {
    // Autoplay refused: paused on purpose with data ready.
    expect(
      streamStartVerdict({
        readyState: 4,
        paused: true,
        autoplayPending: false,
        loading: false,
        msRemaining: -1000,
      }),
    ).toBe("alive");
  });

  it("stops watching a player parked behind the play button", () => {
    expect(
      streamStartVerdict({
        readyState: 1,
        paused: true,
        autoplayPending: false,
        loading: false,
        msRemaining: 5000,
      }),
    ).toBe("not-starting");
  });

  it("keeps watching a stream that is trying to play but starved", () => {
    expect(
      streamStartVerdict({
        readyState: 2,
        paused: false,
        autoplayPending: false,
        loading: true,
        msRemaining: 2000,
      }),
    ).toBe("waiting");
    expect(
      streamStartVerdict({
        readyState: 2,
        paused: false,
        autoplayPending: false,
        loading: true,
        msRemaining: -1,
      }),
    ).toBe("timeout");
  });

  it("faults a stream still showing a spinner with nothing left to start it", () => {
    // Swapping quality or source while paused leaves the spinner up with no
    // autoplay pending. Treating that as parked hung the player forever.
    const starvedBehindSpinner = {
      readyState: 0,
      paused: true,
      autoplayPending: false,
      loading: true,
    };
    expect(
      streamStartVerdict({ ...starvedBehindSpinner, msRemaining: 5000 }),
    ).toBe("waiting");
    expect(streamStartVerdict({ ...starvedBehindSpinner, msRemaining: 0 })).toBe(
      "timeout",
    );
  });
});
