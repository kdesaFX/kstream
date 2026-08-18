/* eslint-disable import/no-extraneous-dependencies */
import type {
  DefaultedFetcherOptions,
  Fetcher,
  FetcherResponse,
} from "@p-stream/providers";
import { describe, expect, it, vi } from "vitest";

import {
  isExtensionNetworkError,
  makeNetworkFallbackFetcher,
} from "@/backend/providers/fetchers";

const options: DefaultedFetcherOptions = {
  headers: {},
  query: {},
  readHeaders: [],
  method: "GET",
};

function response(body: string): FetcherResponse<string> {
  return {
    body,
    finalUrl: "https://example.com",
    headers: new Headers(),
    statusCode: 200,
  };
}

describe("extension network fallback", () => {
  it("recognizes Firefox and Chromium network failures", () => {
    expect(
      isExtensionNetworkError(
        new Error(
          "extension error: NetworkError when attempting to fetch resource.",
        ),
      ),
    ).toBe(true);
    expect(
      isExtensionNetworkError(new Error("extension error: Failed to fetch")),
    ).toBe(true);
    expect(isExtensionNetworkError(new Error("HTTP 404"))).toBe(false);
  });

  it("retries through the proxy and keeps later requests there", async () => {
    const primary = vi
      .fn<Parameters<Fetcher>, ReturnType<Fetcher>>()
      .mockRejectedValueOnce(new Error("extension error: Failed to fetch"));
    const fallback = vi
      .fn<Parameters<Fetcher>, ReturnType<Fetcher>>()
      .mockResolvedValue(response("proxied"));
    const fetcher = makeNetworkFallbackFetcher(primary, fallback);

    await expect(fetcher("https://blocked.example/one", options)).resolves.toEqual(
      response("proxied"),
    );
    await expect(fetcher("https://blocked.example/two", options)).resolves.toEqual(
      response("proxied"),
    );
    expect(primary).toHaveBeenCalledTimes(1);
    expect(fallback).toHaveBeenCalledTimes(2);
  });

  it("does not hide non-network extension errors", async () => {
    const primary = vi
      .fn<Parameters<Fetcher>, ReturnType<Fetcher>>()
      .mockRejectedValue(new Error("extension error: permission denied"));
    const fallback = vi.fn<Parameters<Fetcher>, ReturnType<Fetcher>>();
    const fetcher = makeNetworkFallbackFetcher(primary, fallback);

    await expect(
      fetcher("https://example.com", options),
    ).rejects.toThrow("permission denied");
    expect(fallback).not.toHaveBeenCalled();
  });
});
