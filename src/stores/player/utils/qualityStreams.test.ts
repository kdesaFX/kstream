/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import {
  mergeQualityStreamOptions,
  parseHlsQualities,
  QualityStreamOption,
} from "@/stores/player/utils/qualityStreams";

function option(
  quality: QualityStreamOption["quality"],
  sourceId: string,
): QualityStreamOption {
  return {
    id: `${sourceId}:${quality}`,
    quality,
    sourceId,
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
