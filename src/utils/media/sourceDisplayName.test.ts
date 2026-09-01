/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import { resolveSourceDisplayName } from "@/utils/media/sourceDisplayName";

describe("resolveSourceDisplayName", () => {
  it("applies kstream aliases", () => {
    expect(resolveSourceDisplayName("peestream", "PeeStream")).toBe("kdesa");
    expect(resolveSourceDisplayName("way2movies", "Way2Movies")).toBe("brandon");
    expect(resolveSourceDisplayName("cornclick", "CornClick")).toBe("brian");
    expect(resolveSourceDisplayName("sevenmovies", "7Movies")).toBe("bagel");
    expect(resolveSourceDisplayName("vidlink", "VidLink")).toBe("ethan");
    expect(resolveSourceDisplayName("castletv", "CastleTV")).toBe("zaden");
    expect(resolveSourceDisplayName("nova", "Nova")).toBe("albert");
    expect(resolveSourceDisplayName("tqq", "TQQ (Anime)")).toBe("TQQ");
  });

  it("falls back to provider name then id", () => {
    expect(resolveSourceDisplayName("reyna", "Reyna")).toBe("Reyna");
    expect(resolveSourceDisplayName("reyna")).toBe("reyna");
  });
});
