/* eslint-disable import/no-extraneous-dependencies */
import { afterEach, describe, expect, it, vi } from "vitest";

describe("ensureSameOriginProxiesWarm", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("awaits proxy pings within budget and does not throw", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", {
      location: { origin: "https://kdesa.stream" },
      setTimeout: globalThis.setTimeout.bind(globalThis),
    });

    const { ensureSameOriginProxiesWarm } = await import(
      "@/backend/providers/providers"
    );
    await expect(ensureSameOriginProxiesWarm(500)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalled();
  });
});
