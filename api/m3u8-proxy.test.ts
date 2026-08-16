/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import { rewritePlaylist } from "./m3u8-proxy";

const ORIGIN = "https://kdesa.stream";

function rewrite(body: string, playlistUrl: string): string[] {
  return rewritePlaylist(body, playlistUrl, ORIGIN, "", false).split("\n");
}

/** Which of our two proxies a rewritten line was pointed at. */
function routeOf(line: string): string {
  const target = /URI="([^"]+)"/.exec(line)?.[1] ?? line;
  if (target.startsWith(`${ORIGIN}/api/m3u8-proxy`)) return "playlist-proxy";
  if (target.startsWith(`${ORIGIN}/api/ts-proxy`)) return "segment-proxy";
  return "unproxied";
}

describe("m3u8 proxy playlist rewriting", () => {
  it("routes an extensionless variant to the playlist proxy", () => {
    // Nova serves variants as worker URLs with no path or extension. Guessing
    // from the URL sent them to the segment proxy, which returns them
    // unrewritten, so their cross-origin segments all failed CORS.
    const lines = rewrite(
      [
        "#EXTM3U",
        "#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=1920x1080",
        "https://nova-edge.cf29-7bf.workers.dev/?e=blob",
      ].join("\n"),
      "https://nova-edge-96ed.conter-96e.workers.dev/?e=master",
    );

    expect(routeOf(lines[2])).toBe("playlist-proxy");
  });

  it("routes an extensionless rendition to the playlist proxy", () => {
    const lines = rewrite(
      [
        "#EXTM3U",
        '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="eng",URI="https://nova-edge.cf29-7bf.workers.dev/?e=audio"',
      ].join("\n"),
      "https://nova-edge-96ed.conter-96e.workers.dev/?e=master",
    );

    expect(routeOf(lines[1])).toBe("playlist-proxy");
  });

  it("keeps segments, keys and init segments on the segment proxy", () => {
    const lines = rewrite(
      [
        "#EXTM3U",
        '#EXT-X-KEY:METHOD=AES-128,URI="https://cdn.example.com/key?id=1"',
        '#EXT-X-MAP:URI="https://cdn.example.com/init?id=1"',
        "#EXTINF:5.005,",
        "https://nova-edge.cf29-7bf.workers.dev/?e=segment",
      ].join("\n"),
      "https://nova-edge-96ed.conter-96e.workers.dev/?e=variant",
    );

    expect(lines.slice(1).map(routeOf)).toEqual([
      "segment-proxy",
      "segment-proxy",
      "unproxied", // #EXTINF carries no URI
      "segment-proxy",
    ]);
  });

  it("still recognises a variant by extension when no tag precedes it", () => {
    const lines = rewrite(
      ["#EXTM3U", "https://cdn.example.com/video_1080p.m3u8"].join("\n"),
      "https://cdn.example.com/master.m3u8",
    );

    expect(routeOf(lines[1])).toBe("playlist-proxy");
  });

  it("does not treat the segment after a variant as another playlist", () => {
    const lines = rewrite(
      [
        "#EXTM3U",
        "#EXT-X-STREAM-INF:BANDWIDTH=800000",
        "https://cdn.example.com/?e=variant",
        "#EXTINF:5.005,",
        "https://cdn.example.com/?e=segment",
      ].join("\n"),
      "https://cdn.example.com/?e=master",
    );

    expect(routeOf(lines[2])).toBe("playlist-proxy");
    expect(routeOf(lines[4])).toBe("segment-proxy");
  });
});
