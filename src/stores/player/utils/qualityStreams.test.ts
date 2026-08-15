/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import {
  firstNonEmptyQualities,
  mergeQualityStreamOptions,
  parseHlsQualities,
  QualityStreamOption,
} from "@/stores/player/utils/qualityStreams";
import type { SourceQuality } from "@/stores/player/utils/qualities";

function option(
  quality: QualityStreamOption["quality"],
  sourceId: string,
): QualityStreamOption {
  return {
    id: `${sourceId}:${quality}`,
    quality,
    sourceId,
    sourceName: sourceId,
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

describe("mergeQualityStreamOptions", () => {
  it("keeps the higher-ranked source for an existing tier", () => {
    const primary = option("480", "mai-sakurajima");
    const alternate480 = option("480", "reyna");
    const alternate4k = option("4k", "reyna");

    expect(
      mergeQualityStreamOptions([primary], [alternate480, alternate4k]),
    ).toEqual([primary, alternate4k]);
  });
});
