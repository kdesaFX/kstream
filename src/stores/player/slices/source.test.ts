/* eslint-disable import/no-extraneous-dependencies */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  PlayerMeta,
  getMediaKey,
  playerStatus,
} from "@/stores/player/slices/source";
import { usePlayerStore } from "@/stores/player/store";

const EPISODE_META: PlayerMeta = {
  type: "show",
  title: "Why the Hell Are You Here, Teacher!?",
  tmdbId: "86836",
  releaseYear: 2019,
  episodeRuntime: 12,
  season: { number: 1, tmdbId: "season-1", title: "Season 1" },
  episode: { number: 1, tmdbId: "episode-1", title: "First Period", runtime: 12 },
};

function playFrom(sourceId: string) {
  const store = usePlayerStore.getState();
  store.setMeta(EPISODE_META, playerStatus.SCRAPING);
  store.setSourceId(sourceId);
}

describe("reportStreamDuration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    usePlayerStore.getState().reset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("keeps playing a stream whose length matches the episode", () => {
    playFrom("oneembed");
    usePlayerStore.getState().reportStreamDuration(12.4 * 60);

    const store = usePlayerStore.getState();
    expect(store.status).toBe(playerStatus.PLAYING);
    expect(store.wrongRuntimeSkips).toBe(0);
  });

  it("drops a source serving a video that is far too long", () => {
    playFrom("oneembed");
    usePlayerStore.getState().reportStreamDuration(20.5 * 60);

    const store = usePlayerStore.getState();
    expect(store.status).toBe(playerStatus.SCRAPING);
    expect(store.resumeFromSourceId).toBe("oneembed");
    expect(store.failedSourcesPerMedia[getMediaKey(EPISODE_META)!]).toContain(
      "oneembed",
    );
    expect(store.wrongRuntimeSkips).toBe(1);
  });

  it("waits for a short duration to settle before dropping the source", () => {
    playFrom("oneembed");
    // A playlist that is still loading looks like a two minute video.
    usePlayerStore.getState().reportStreamDuration(2 * 60);
    expect(usePlayerStore.getState().status).toBe(playerStatus.PLAYING);

    // It grew into the real thing, so nothing should be dropped.
    usePlayerStore.setState((s) => {
      s.progress.duration = 12 * 60;
    });
    vi.runOnlyPendingTimers();
    expect(usePlayerStore.getState().status).toBe(playerStatus.PLAYING);
    expect(usePlayerStore.getState().wrongRuntimeSkips).toBe(0);
  });

  it("drops the source when a short duration is still short later", () => {
    playFrom("oneembed");
    usePlayerStore.getState().reportStreamDuration(2 * 60);
    usePlayerStore.setState((s) => {
      s.progress.duration = 2 * 60;
    });
    vi.runOnlyPendingTimers();

    expect(usePlayerStore.getState().status).toBe(playerStatus.SCRAPING);
    expect(usePlayerStore.getState().wrongRuntimeSkips).toBe(1);
  });

  it("gives up second-guessing after a few sources in a row", () => {
    for (const sourceId of ["a", "b", "c"]) {
      playFrom(sourceId);
      usePlayerStore.getState().reportStreamDuration(20.5 * 60);
    }
    expect(usePlayerStore.getState().wrongRuntimeSkips).toBe(3);

    playFrom("d");
    usePlayerStore.getState().reportStreamDuration(20.5 * 60);
    expect(usePlayerStore.getState().status).toBe(playerStatus.PLAYING);
    expect(usePlayerStore.getState().wrongRuntimeSkips).toBe(3);
  });

  it("retries the same source's next mirror when an embed is at fault", () => {
    playFrom("tqq");
    usePlayerStore.getState().setEmbedId("tqq-nino");
    usePlayerStore.getState().reportStreamDuration(20.5 * 60);

    const store = usePlayerStore.getState();
    expect(store.status).toBe(playerStatus.SCRAPING);
    expect(store.resumeFromSourceId).toBeNull();
    expect(
      store.failedEmbedsPerMedia[getMediaKey(EPISODE_META)!].tqq,
    ).toContain("tqq-nino");
  });

  it("ignores durations while not playing", () => {
    const store = usePlayerStore.getState();
    store.setMeta(EPISODE_META, playerStatus.SCRAPING);
    store.reportStreamDuration(20.5 * 60);
    expect(usePlayerStore.getState().status).toBe(playerStatus.SCRAPING);
    expect(usePlayerStore.getState().wrongRuntimeSkips).toBe(0);
  });
});
