/* eslint-disable import/no-extraneous-dependencies */
import { Stream } from "@p-stream/providers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { convertRunoutputToSource } from "./convertRunoutputToSource";

vi.mock("@/backend/extension/messaging", () => ({
  isExtensionActiveCached: vi.fn(() => false),
}));

vi.mock("@/components/player/utils/proxy", () => ({
  createM3U8ProxyUrl: vi.fn(
    (url: string) => `https://kdesa.stream/api/m3u8-proxy?url=${encodeURIComponent(url)}&browser=1`,
  ),
  createMP4ProxyUrl: vi.fn((url: string) => url),
  isUrlAlreadyProxied: vi.fn(() => false),
}));

describe("convertRunoutputToSource HLS proxying", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      __PSTREAM_DESKTOP__: undefined,
      __KSTREAM_DESKTOP_IPC__: undefined,
    });
    Object.defineProperty(globalThis.navigator, "userAgent", {
      configurable: true,
      value:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:154.0) Gecko/20100101 Firefox/154.0",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("proxies headerless HLS on desktop Firefox without the extension", () => {
    const stream = {
      id: "test-hls",
      type: "hls",
      playlist: "https://cdn.example.com/movie/master.m3u8",
      captions: [],
      flags: [],
    } as unknown as Stream;

    const out = convertRunoutputToSource({ stream });

    expect(out.type).toBe("hls");
    if (out.type !== "hls") return;
    expect(out.url).toContain("/api/m3u8-proxy");
    expect(out.url).not.toBe("https://cdn.example.com/movie/master.m3u8");
  });
});
