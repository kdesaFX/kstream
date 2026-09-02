import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openDesktopOAuthInBrowser } from "./desktopOAuth";

describe("openDesktopOAuthInBrowser", () => {
  const oauthUrl = "https://accounts.google.com/o/oauth2/v2/auth?client_id=test";

  beforeEach(() => {
    window.__KSTREAM_DESKTOP_IPC__ = {
      invoke: vi.fn(),
    };
    vi.spyOn(window, "open").mockReturnValue({} as Window);
  });

  afterEach(() => {
    delete window.__KSTREAM_DESKTOP_IPC__;
    vi.restoreAllMocks();
  });

  it("uses openExternalAuth when the desktop shell supports it", async () => {
    const invoke = vi.mocked(window.__KSTREAM_DESKTOP_IPC__!.invoke);
    invoke.mockResolvedValue({ ok: true });

    await openDesktopOAuthInBrowser(oauthUrl);

    expect(invoke).toHaveBeenCalledWith("openExternalAuth", { url: oauthUrl });
    expect(window.open).not.toHaveBeenCalled();
  });

  it("falls back to window.open on older desktop builds", async () => {
    const invoke = vi.mocked(window.__KSTREAM_DESKTOP_IPC__!.invoke);
    invoke.mockRejectedValue(new Error("Blocked desktop channel: openExternalAuth"));

    await openDesktopOAuthInBrowser(oauthUrl);

    expect(window.open).toHaveBeenCalledWith(
      oauthUrl,
      "_blank",
      "noopener,noreferrer",
    );
  });
});
