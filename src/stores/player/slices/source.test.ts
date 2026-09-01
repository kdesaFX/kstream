/* eslint-disable import/no-extraneous-dependencies */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  PlayerMeta,
  getMediaKey,
  playerStatus,
  resolveFailedSourceMediaKey,
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

describe("resolveFailedSourceMediaKey", () => {
  it("derives the same key from scrape media when player meta is unset", () => {
    const media = {
      type: "show" as const,
      title: EPISODE_META.title,
      releaseYear: EPISODE_META.releaseYear,
      tmdbId: EPISODE_META.tmdbId,
      season: { number: 1, tmdbId: "season-1", title: "Season 1" },
      episode: { number: 1, tmdbId: "episode-1", title: "First Period" },
    };
    expect(resolveFailedSourceMediaKey(null, media)).toBe(
      getMediaKey(EPISODE_META),
    );
  });
});

describe("addFailedSource media key override", () => {
  beforeEach(() => {
    usePlayerStore.getState().reset();
  });

  it("records failures under an explicit media key", () => {
    const mediaKey = getMediaKey(EPISODE_META)!;
    usePlayerStore.getState().addFailedSource("nova", mediaKey);
    expect(usePlayerStore.getState().failedSourcesPerMedia[mediaKey]).toEqual([
      "nova",
    ]);
  });
});

describe("registerAudioStreamOptions", () => {
  beforeEach(() => {
    usePlayerStore.getState().reset();
  });

  it("does not auto-select an unrelated dub when the playing stream has no language", () => {
    usePlayerStore.setState((s) => {
      s.source = {
        type: "hls",
        url: "https://example.com/nova.m3u8",
        // blank / missing audioLanguage — Nova English often looks like this
      } as any;
      s.currentAudioStreamId = null;
    });

    usePlayerStore.getState().registerAudioStreamOptions([
      {
        id: "cuevana:direct:1:es",
        language: "es",
        label: "Spanish",
        sourceId: "cuevana3",
        embedId: null,
        source: { type: "hls", url: "https://example.com/es.m3u8" } as any,
        captions: [],
      },
      {
        id: "french:direct:1:fr",
        language: "fr",
        label: "French",
        sourceId: "vixsrc",
        embedId: null,
        source: { type: "hls", url: "https://example.com/fr.m3u8" } as any,
        captions: [],
      },
    ]);

    const store = usePlayerStore.getState();
    expect(store.audioStreamOptions.map((o) => o.language).sort()).toEqual([
      "es",
      "fr",
    ]);
    // Must stay null — previously fell through to alphabetical French.
    expect(store.currentAudioStreamId).toBeNull();
  });

  it("selects the option matching the playing stream language", () => {
    usePlayerStore.setState((s) => {
      s.source = {
        type: "hls",
        url: "https://example.com/en.m3u8",
        audioLanguage: "en",
      } as any;
      s.currentAudioStreamId = null;
    });

    usePlayerStore.getState().registerAudioStreamOptions([
      {
        id: "nova:direct:0:en",
        language: "en",
        label: "English",
        sourceId: "nova",
        embedId: null,
        source: { type: "hls", url: "https://example.com/en.m3u8" } as any,
        captions: [],
      },
      {
        id: "vixsrc:direct:1:fr",
        language: "fr",
        label: "French",
        sourceId: "vixsrc",
        embedId: null,
        source: { type: "hls", url: "https://example.com/fr.m3u8" } as any,
        captions: [],
      },
    ]);

    expect(usePlayerStore.getState().currentAudioStreamId).toBe(
      "nova:direct:0:en",
    );
  });
});
