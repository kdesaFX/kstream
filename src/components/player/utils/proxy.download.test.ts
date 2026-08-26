/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import {
  buildFfmpegCommand,
  buildHlsDownloaderUrl,
  buildNm3u8Command,
  buildYtDlpCommand,
  isOriginalFileHost,
  unwrapProxiedMediaUrl,
} from "@/components/player/utils/proxy";

describe("unwrapProxiedMediaUrl", () => {
  it("unwraps same-origin m3u8-proxy URLs and embedded headers", () => {
    const upstream = "https://cdn.example.com/play.m3u8?token=abc";
    const headers = { Referer: "https://watch.example.com/", Origin: "https://watch.example.com" };
    const proxied = `https://zstream.mov/api/m3u8-proxy?url=${encodeURIComponent(upstream)}&headers=${encodeURIComponent(JSON.stringify(headers))}&browser=1`;

    expect(unwrapProxiedMediaUrl(proxied)).toEqual({
      url: upstream,
      headers,
    });
  });

  it("does not treat unrelated ?url= query params as proxies", () => {
    const raw = "https://cdn.example.com/video.m3u8?url=keep-me";
    expect(unwrapProxiedMediaUrl(raw)).toEqual({ url: raw, headers: {} });
  });

  it("unwraps destination-style proxy URLs", () => {
    const dest = "https://cdn.example.com/seg.ts";
    const proxied = `https://kdesa.stream/api/proxy?destination=${encodeURIComponent(dest)}`;
    expect(unwrapProxiedMediaUrl(proxied)).toEqual({
      url: dest,
      headers: {},
    });
  });

  it("passes through plain playlist URLs", () => {
    const raw = "https://cdn.example.com/master.m3u8";
    expect(unwrapProxiedMediaUrl(raw)).toEqual({ url: raw, headers: {} });
  });
});

describe("download command builders", () => {
  it("builds yt-dlp with headers", () => {
    expect(
      buildYtDlpCommand("https://cdn.example.com/a.m3u8", {
        Referer: "https://watch.example.com/",
      }),
    ).toBe(
      'yt-dlp --add-header "Referer:https://watch.example.com/" "https://cdn.example.com/a.m3u8" -o "%(title)s.%(ext)s"',
    );
  });

  it("builds N_m3u8DL-RE with headers", () => {
    expect(
      buildNm3u8Command("https://cdn.example.com/a.m3u8", {
        Origin: "https://watch.example.com",
      }),
    ).toBe(
      'N_m3u8DL-RE "https://cdn.example.com/a.m3u8" --header "Origin: https://watch.example.com"',
    );
  });

  it("builds ffmpeg with headers", () => {
    expect(
      buildFfmpegCommand("https://cdn.example.com/a.m3u8", {
        Referer: "https://watch.example.com/",
      }),
    ).toBe(
      'ffmpeg -headers "Referer: https://watch.example.com/\\r\\n" -i "https://cdn.example.com/a.m3u8" -c copy output.mp4',
    );
  });

  it("builds GUI downloader URL", () => {
    expect(buildHlsDownloaderUrl("https://cdn.example.com/a.m3u8")).toBe(
      "https://hlsdownloader.thetuhin.com/?url=https%3A%2F%2Fcdn.example.com%2Fa.m3u8",
    );
  });

  it("builds commands without headers", () => {
    expect(buildYtDlpCommand("https://cdn.example.com/a.m3u8")).toBe(
      'yt-dlp "https://cdn.example.com/a.m3u8" -o "%(title)s.%(ext)s"',
    );
    expect(buildNm3u8Command("https://cdn.example.com/a.m3u8")).toBe(
      'N_m3u8DL-RE "https://cdn.example.com/a.m3u8"',
    );
    expect(buildFfmpegCommand("https://cdn.example.com/a.m3u8")).toBe(
      'ffmpeg -i "https://cdn.example.com/a.m3u8" -c copy output.mp4',
    );
  });
});

describe("isOriginalFileHost", () => {
  it("allows only zstream.mov hosts", () => {
    expect(isOriginalFileHost("zstream.mov")).toBe(true);
    expect(isOriginalFileHost("www.zstream.mov")).toBe(true);
    expect(isOriginalFileHost("ZSTREAM.MOV")).toBe(true);
  });

  it("rejects kstream and other hosts", () => {
    expect(isOriginalFileHost("kdesa.stream")).toBe(false);
    expect(isOriginalFileHost("localhost")).toBe(false);
    expect(isOriginalFileHost("")).toBe(false);
  });
});
