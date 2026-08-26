/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import { proxiedDestinationUrl } from "@/utils/hosting/proxyUrls";

describe("proxiedDestinationUrl", () => {
  it("does not insert a trailing slash before the query (SPA trap)", () => {
    const dest = "https://api.themoviedb.org/3/trending/movie/day";
    const proxied = proxiedDestinationUrl(dest, [
      "https://kdesa.stream/api/proxy",
    ]);
    expect(proxied).toBe(
      `https://kdesa.stream/api/proxy?destination=${encodeURIComponent(dest)}`,
    );
    expect(proxied).not.toContain("/api/proxy/?");
  });

  it("appends with & when the proxy already has a query", () => {
    const dest = "https://image.tmdb.org/t/p/w185/x.jpg";
    expect(
      proxiedDestinationUrl(dest, ["https://worker.dev/?key=abc"]),
    ).toBe(
      `https://worker.dev/?key=abc&destination=${encodeURIComponent(dest)}`,
    );
  });
});
