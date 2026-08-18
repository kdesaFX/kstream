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

function response<T>(body: T): FetcherResponse<T> {
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
    const primaryCall = vi.fn();
    const fallbackCall = vi.fn();
    const primary: Fetcher = async () => {
      primaryCall();
      throw new Error("extension error: Failed to fetch");
    };
    const fallback: Fetcher = async <T>() => {
      fallbackCall();
      return response("proxied" as unknown as T);
    };
    const fetcher = makeNetworkFallbackFetcher(primary, fallback);

    await expect(fetcher("https://blocked.example/one", options)).resolves.toEqual(
      response("proxied"),
    );
    await expect(fetcher("https://blocked.example/two", options)).resolves.toEqual(
      response("proxied"),
    );
    expect(primaryCall).toHaveBeenCalledTimes(1);
    expect(fallbackCall).toHaveBeenCalledTimes(2);
  });

  it("does not hide non-network extension errors", async () => {
    const fallbackCall = vi.fn();
    const primary: Fetcher = async () => {
      throw new Error("extension error: permission denied");
    };
    const fallback: Fetcher = async <T>() => {
      fallbackCall();
      return response("unused" as unknown as T);
    };
    const fetcher = makeNetworkFallbackFetcher(primary, fallback);

    await expect(
      fetcher("https://example.com", options),
    ).rejects.toThrow("permission denied");
    expect(fallbackCall).not.toHaveBeenCalled();
  });
});
