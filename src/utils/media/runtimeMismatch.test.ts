/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import {
  expectedRuntime,
  isWrongRuntime,
  runtimeVerdict,
} from "@/utils/media/runtimeMismatch";

const minutes = (value: number) => value * 60;

describe("expectedRuntime", () => {
  it("prefers the episode's own runtime over the show average", () => {
    expect(
      expectedRuntime({ type: "show", episodeRuntime: 45, episode: { runtime: 12 } }),
    ).toEqual({ minutes: 12, confidence: "exact" });
  });

  it("falls back to the show average", () => {
    expect(expectedRuntime({ type: "show", episodeRuntime: 24 })).toEqual({
      minutes: 24,
      confidence: "average",
    });
  });

  it("has nothing to say without a runtime", () => {
    expect(expectedRuntime({ type: "movie" })).toBeNull();
    expect(expectedRuntime({ type: "movie", runtime: 0 })).toBeNull();
    expect(expectedRuntime({ type: "show", episode: { runtime: 1 } })).toBeNull();
    expect(expectedRuntime(null)).toBeNull();
  });
});

describe("runtimeVerdict", () => {
  it("catches the 20 minute video 1Embed serves for a 12 minute episode", () => {
    const meta = { type: "show" as const, episode: { runtime: 12 } };
    expect(runtimeVerdict(meta, minutes(20.5))).toBe("tooLong");
    expect(isWrongRuntime(meta, minutes(20.5))).toBe(true);
  });

  it("accepts the small differences real streams have", () => {
    expect(runtimeVerdict({ type: "show", episode: { runtime: 23 } }, minutes(23.7))).toBe("ok");
    expect(runtimeVerdict({ type: "show", episode: { runtime: 59 } }, minutes(58))).toBe("ok");
    expect(runtimeVerdict({ type: "movie", runtime: 148 }, minutes(148.1))).toBe("ok");
  });

  it("accepts an extended cut of a movie", () => {
    expect(runtimeVerdict({ type: "movie", runtime: 178 }, minutes(228))).toBe("ok");
  });

  it("gives short titles absolute slack instead of a strict ratio", () => {
    // A 12 minute episode arriving as 17 minutes is odd but within slack.
    expect(runtimeVerdict({ type: "show", episode: { runtime: 12 } }, minutes(17))).toBe("ok");
    expect(runtimeVerdict({ type: "show", episode: { runtime: 12 } }, minutes(7))).toBe("ok");
  });

  it("lets a double-length premiere pass when only a show average is known", () => {
    expect(runtimeVerdict({ type: "show", episodeRuntime: 22 }, minutes(44))).toBe("ok");
    expect(runtimeVerdict({ type: "show", episodeRuntime: 22 }, minutes(90))).toBe("tooLong");
  });

  it("flags a stream that is a fraction of the title", () => {
    expect(runtimeVerdict({ type: "movie", runtime: 148 }, minutes(22))).toBe("tooShort");
  });

  it("stays quiet when the duration is unusable", () => {
    const meta = { type: "movie" as const, runtime: 148 };
    expect(runtimeVerdict(meta, 0)).toBe("ok");
    expect(runtimeVerdict(meta, Infinity)).toBe("ok");
    expect(runtimeVerdict(meta, NaN)).toBe("ok");
    expect(runtimeVerdict(meta, null)).toBe("ok");
    expect(runtimeVerdict(meta, 30)).toBe("ok");
  });

  it("stays quiet when the title has no known runtime", () => {
    expect(runtimeVerdict({ type: "show" }, minutes(200))).toBe("ok");
  });
});
