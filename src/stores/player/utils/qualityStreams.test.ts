/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import type { Stream } from "@p-stream/providers";

import {
  alternateSourceLabels,
  choicesForQualityTier,
  firstNonEmptyQualities,
  hasMultipleQualityChoices,
  languagesByQuality,
  mergeQualityStreamOptions,
  parseHlsQualities,
  pickBestQualityStream,
  QualityStreamOption,
  rememberIdentifiedQualities,
  selectableQualityTiers,
  streamToQualityOptions,
} from "@/stores/player/utils/qualityStreams";
import type { SourceQuality } from "@/stores/player/utils/qualities";

function option(
  quality: QualityStreamOption["quality"],
  sourceId: string,
  languages: string[] = [],
): QualityStreamOption {
  return {
    id: `${sourceId}:${quality}`,
    quality,
    sourceId,
    sourceName: sourceId,
    languages,
    source: {
      type: "file",
      qualities: {
        [quality]: { type: "mp4", url: `https://example.com/${quality}.mp4` },
      },
    },
    captions: [],
  };
}

describe("parseHlsQualities", () => {
  it("maps master-playlist resolutions to menu quality buckets", () => {
    const playlist = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
360.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1800000,RESOLUTION=1280x720
720.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=3840x2160
4k.m3u8`;

    expect(parseHlsQualities(playlist)).toEqual(["360", "720", "4k"]);
  });

  it("deduplicates variants that share a quality bucket", () => {
    const playlist = `#EXTM3U
#EXT-X-STREAM-INF:RESOLUTION=1920x1080
avc.m3u8
#EXT-X-STREAM-INF:RESOLUTION=2560x1440
hevc.m3u8`;

    expect(parseHlsQualities(playlist)).toEqual(["1080"]);
  });
});

function later<T>(value: T, ms: number): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(value), ms);
  });
}

describe("firstNonEmptyQualities", () => {
  it("answers as soon as one read has tiers, without waiting for the slow one", async () => {
    const slow = later<SourceQuality[]>(["1080"], 5_000);

    await expect(
      firstNonEmptyQualities([later<SourceQuality[]>(["480"], 0), slow]),
    ).resolves.toEqual(["480"]);
  });

  it("waits out an empty read for one that still might answer", async () => {
    await expect(
      firstNonEmptyQualities([
        Promise.resolve([]),
        later<SourceQuality[]>(["720"], 10),
      ]),
    ).resolves.toEqual(["720"]);
  });

  it("gives up only once every read came back empty", async () => {
    await expect(
      firstNonEmptyQualities([Promise.resolve([]), Promise.resolve([])]),
    ).resolves.toEqual([]);
  });

  it("treats a rejected read as empty rather than failing the probe", async () => {
    await expect(
      firstNonEmptyQualities([
        Promise.reject(new Error("cors")),
        later<SourceQuality[]>(["360"], 0),
      ]),
    ).resolves.toEqual(["360"]);
  });
});

describe("rememberIdentifiedQualities", () => {
  it("identifies a playlist once and reuses the answer", async () => {
    let reads = 0;
    const identify = async () => {
      reads += 1;
      return ["720"] as SourceQuality[];
    };

    await rememberIdentifiedQualities("playlist-a", identify);
    await expect(
      rememberIdentifiedQualities("playlist-a", identify),
    ).resolves.toEqual(["720"]);
    expect(reads).toBe(1);
  });

  it("shares one read between callers that ask at the same time", async () => {
    let reads = 0;
    const identify = () => {
      reads += 1;
      return later<SourceQuality[]>(["1080"], 5);
    };

    await Promise.all([
      rememberIdentifiedQualities("playlist-b", identify),
      rememberIdentifiedQualities("playlist-b", identify),
    ]);
    expect(reads).toBe(1);
  });

  it("retries later when a read came back with nothing", async () => {
    let reads = 0;
    const identify = async () => {
      reads += 1;
      return (reads === 1 ? [] : ["480"]) as SourceQuality[];
    };

    await expect(
      rememberIdentifiedQualities("playlist-c", identify),
    ).resolves.toEqual([]);
    await expect(
      rememberIdentifiedQualities("playlist-c", identify),
    ).resolves.toEqual(["480"]);
    expect(reads).toBe(2);
  });
});

describe("streamToQualityOptions", () => {
  function fileStream(qualities: Record<string, string>): Stream {
    return {
      id: "nova-raven-16",
      type: "file",
      qualities: Object.fromEntries(
        Object.entries(qualities).map(([q, url]) => [q, { type: "mp4", url }]),
      ),
      captions: [],
      flags: [],
    } as unknown as Stream;
  }

  it("skips the 'unknown' tier, which says nothing and usually cannot play", async () => {
    const options = await streamToQualityOptions(
      fileStream({
        unknown: "https://example.com/unknown.mp4",
        "720": "https://example.com/720.mp4",
      }),
      "nova",
    );

    expect(options.map((o) => o.quality)).toEqual(["720"]);
  });

  it("offers nothing rather than an unknown-only entry", async () => {
    const options = await streamToQualityOptions(
      fileStream({ unknown: "https://example.com/unknown.mp4" }),
      "nova",
    );

    expect(options).toEqual([]);
  });
});

describe("mergeQualityStreamOptions", () => {
  it("keeps every source at a tier instead of collapsing to one", () => {
    const primary = option("480", "mai-sakurajima");
    const alternate480 = option("480", "reyna");
    const alternate4k = option("4k", "reyna");

    expect(
      mergeQualityStreamOptions([primary], [alternate480, alternate4k]),
    ).toEqual([primary, alternate480, alternate4k]);
  });

  it("dedupes by option id when the same entry is registered twice", () => {
    const english480 = option("480", "7movies", ["en"]);
    const hindi480 = option("480", "nova", ["hi"]);
    const hindi1080 = option("1080", "nova", ["hi"]);

    expect(
      mergeQualityStreamOptions([english480], [hindi480, hindi1080]),
    ).toEqual([english480, hindi480, hindi1080]);
  });
});

describe("pickBestQualityStream", () => {
  function hls(id: string): Stream {
    return {
      id,
      type: "hls",
      playlist: `https://example.com/${id}.m3u8`,
      captions: [],
      flags: [],
      audioLanguage: "en",
    } as unknown as Stream;
  }

  function file(qualities: Record<string, string>): Stream {
    return {
      id: "file-1",
      type: "file",
      qualities: Object.fromEntries(
        Object.entries(qualities).map(([q, url]) => [q, { type: "mp4", url }]),
      ),
      captions: [],
      flags: [],
      audioLanguage: "en",
    } as unknown as Stream;
  }

  it("keeps provider order for HLS mirrors when tiers are unknown", () => {
    const streams = [hls("best"), hls("mirror-2"), hls("mirror-3")];
    expect(pickBestQualityStream(streams).id).toBe("best");
  });

  it("prefers the highest labeled file tier", () => {
    const low = file({ "720": "https://example.com/720.mp4" });
    const high = {
      ...file({ "1080": "https://example.com/1080.mp4" }),
      id: "file-1080",
    } as Stream;
    expect(pickBestQualityStream([low, high]).id).toBe("file-1080");
  });
});

describe("choicesForQualityTier", () => {
  it("dedupes duplicate source rows at the same tier", () => {
    const choices = choicesForQualityTier({
      quality: "720",
      available: ["480"],
      alternates: [
        option("720", "nova", ["en"]),
        option("720", "nova", ["en"]),
        option("720", "cornclick", ["en"]),
      ],
      currentSourceId: "7movies",
      currentLanguage: "en",
    });

    expect(choices.filter((c) => c.kind === "alternate")).toHaveLength(2);
  });

  it("lists the current ladder and every alternate at the tier", () => {
    const choices = choicesForQualityTier({
      quality: "720",
      available: ["480", "720"],
      alternates: [option("720", "vidlink", ["en"]), option("1080", "nova")],
      currentSourceId: "tqq",
      currentLanguage: "en",
    });

    expect(choices).toHaveLength(2);
    expect(choices[0]).toMatchObject({
      kind: "current",
      sourceId: "tqq",
      languages: ["en"],
    });
    expect(choices[1]).toMatchObject({
      kind: "alternate",
      option: expect.objectContaining({ sourceId: "vidlink" }),
    });
  });

  it("skips alternates from the current source when its ladder already has the tier", () => {
    const choices = choicesForQualityTier({
      quality: "720",
      available: ["720"],
      alternates: [option("720", "tqq")],
      currentSourceId: "tqq",
      currentLanguage: "en",
    });

    expect(choices).toEqual([
      expect.objectContaining({ kind: "current", sourceId: "tqq" }),
    ]);
  });
});

describe("hasMultipleQualityChoices", () => {
  it("is true when more than one source can serve the tier", () => {
    expect(
      hasMultipleQualityChoices("720", {
        available: ["720"],
        alternates: [option("720", "vidlink")],
        currentSourceId: "tqq",
        currentLanguage: "en",
      }),
    ).toBe(true);
  });
});

describe("languagesByQuality", () => {
  it("flags every language that can play at a tier", () => {
    expect(
      languagesByQuality({
        available: ["480"],
        currentLanguage: "en",
        alternates: [
          option("480", "7movies", ["en"]),
          option("1080", "nova", ["hi"]),
          option("720", "vixsrc", ["fr", "ta"]),
        ],
      }),
    ).toEqual({
      "480": ["en"],
      "720": ["fr", "ta"],
      "1080": ["hi"],
    });
  });

  it("puts English first when sorting mixed language flags", () => {
    expect(
      languagesByQuality({
        available: [],
        currentLanguage: null,
        alternates: [option("720", "mix", ["ta", "en", "hi"])],
      }),
    ).toEqual({
      "720": ["en", "hi", "ta"],
    });
  });
});
describe("selectableQualityTiers", () => {
  it("offers tiers another source can serve alongside the current ladder", () => {
    expect(selectableQualityTiers(["480"], [option("1080", "reyna")])).toEqual([
      "480",
      "1080",
    ]);
  });

  it("lists a shared tier once", () => {
    expect(selectableQualityTiers(["720"], [option("720", "reyna")])).toEqual([
      "720",
    ]);
  });
});

describe("alternateSourceLabels", () => {
  it("names the source for a tier the current one cannot serve", () => {
    expect(
      alternateSourceLabels({
        available: ["480"],
        alternates: [option("1080", "reyna"), option("4k", "reyna")],
        currentQuality: "480",
        currentSourceId: "tqq",
      }),
    ).toEqual({ "1080": "reyna", "4k": "reyna" });
  });

  it("leaves the current source's own tiers unlabelled", () => {
    expect(
      alternateSourceLabels({
        available: ["480", "720"],
        alternates: [option("720", "reyna")],
        currentQuality: "480",
        currentSourceId: "tqq",
      }),
    ).toEqual({});
  });

  it("never labels the tier playing right now, so its tick still shows", () => {
    // The player reports the chosen tier even when hls.js did not expose it,
    // which used to put another source's name where the tick belongs.
    expect(
      alternateSourceLabels({
        available: ["480"],
        alternates: [option("720", "1embed")],
        currentQuality: "720",
        currentSourceId: "tqq",
      }),
    ).toEqual({});
  });

  it("does not treat the current source as an alternate to itself", () => {
    expect(
      alternateSourceLabels({
        available: [],
        alternates: [option("1080", "tqq")],
        currentQuality: "720",
        currentSourceId: "tqq",
      }),
    ).toEqual({});
  });

  it("shows no label when several alternates share a tier", () => {
    expect(
      alternateSourceLabels({
        available: ["480"],
        alternates: [option("1080", "reyna"), option("1080", "vidlink")],
        currentQuality: "480",
        currentSourceId: "tqq",
      }),
    ).toEqual({});
  });
});
