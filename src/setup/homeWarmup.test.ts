/* eslint-disable import/no-extraneous-dependencies */
import { afterEach, describe, expect, it } from "vitest";

import {
  BOOT_WARMUP_MAX_MS,
  BOOT_WARMUP_MIN_MS,
  consumeHomeWarmup,
  peekHomeWarmup,
  runBootWarmup,
  setHomeWarmupCacheForTests,
  settleWithTimeout,
  sleep,
} from "@/setup/homeWarmup";
import type { FeaturedMedia } from "@/pages/discover/lib/featuredHero";

const sampleMedia: FeaturedMedia[] = [
  {
    id: 1,
    overview: "A film",
    title: "Sample",
    type: "movie",
    backdrop_path: "/x.jpg",
  },
];

describe("homeWarmup cache", () => {
  afterEach(() => {
    setHomeWarmupCacheForTests(null);
  });

  it("peeks and consumes only matching category/language", () => {
    setHomeWarmupCacheForTests({
      category: "movies",
      language: "en",
      media: sampleMedia,
      fetchedAt: Date.now(),
    });

    expect(peekHomeWarmup("tvshows", "en")).toBeNull();
    expect(peekHomeWarmup("movies", "fr")).toBeNull();
    expect(peekHomeWarmup("movies", "en")).toEqual(sampleMedia);

    expect(consumeHomeWarmup("movies", "en")).toEqual(sampleMedia);
    expect(peekHomeWarmup("movies", "en")).toBeNull();
    expect(consumeHomeWarmup("movies", "en")).toBeNull();
  });
});

describe("settleWithTimeout", () => {
  it("returns the value when the promise wins", async () => {
    const value = await settleWithTimeout(Promise.resolve("ok"), 200);
    expect(value).toBe("ok");
  });

  it("returns undefined when the timeout wins", async () => {
    const value = await settleWithTimeout(sleep(200).then(() => "late"), 20);
    expect(value).toBeUndefined();
  });
});

describe("runBootWarmup", () => {
  it("waits at least minMs even when work is instant", async () => {
    const started = Date.now();
    await runBootWarmup({
      authWork: async () => undefined,
      heroWork: async () => undefined,
      minMs: 50,
      maxMs: 500,
    });
    expect(Date.now() - started).toBeGreaterThanOrEqual(45);
  });

  it("does not exceed maxMs when work is slow", async () => {
    const started = Date.now();
    await runBootWarmup({
      authWork: async () => {
        await sleep(400);
      },
      heroWork: async () => {
        await sleep(400);
      },
      minMs: 10,
      maxMs: 80,
    });
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(200);
    expect(elapsed).toBeGreaterThanOrEqual(10);
  });

  it("continues when auth or hero work rejects", async () => {
    await expect(
      runBootWarmup({
        authWork: async () => {
          throw new Error("auth boom");
        },
        heroWork: async () => {
          throw new Error("hero boom");
        },
        minMs: 10,
        maxMs: 100,
      }),
    ).resolves.toBeUndefined();
  });

  it("exports the planned boot timing defaults", () => {
    expect(BOOT_WARMUP_MIN_MS).toBe(400);
    expect(BOOT_WARMUP_MAX_MS).toBe(1500);
  });
});
