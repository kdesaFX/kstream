/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import {
  isKnownBadStreamUrl,
  validatePlaylistBody,
  validateStream,
} from "@/components/player/utils/validateScrapedStream";

describe("validateScrapedStream", () => {
  it("rejects nova decoy playlists", () => {
    expect(
      isKnownBadStreamUrl(
        "https://nova-edge-foo.workers.dev/api/decoy/p.m3u8",
      ),
    ).toBe("decoy playlist");
  });

  it("accepts real m3u8 bodies", () => {
    expect(
      validatePlaylistBody("#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:10.0,\nseg.ts\n"),
    ).toEqual({ ok: true });
  });

  it("rejects html error shells", () => {
    expect(validatePlaylistBody("<html><body>403 Forbidden</body></html>")).toEqual({
      ok: false,
      reason: "HTML error page",
    });
  });

  it("skips pre-play probe for origin-gated playlists", async () => {
    const result = await validateStream({
      id: "w2m-0",
      type: "hls",
      playlist:
        "https://scraper.way2movies.fun/netmirror/hls/playlist.m3u8?id=1",
      flags: [],
    } as any);
    expect(result).toEqual({ ok: true });
  });

  it("rejects empty bodies", () => {
    expect(validatePlaylistBody("   ")).toEqual({
      ok: false,
      reason: "empty playlist",
    });
  });
});
