/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import { resolveSourceDisplayName } from "@/utils/media/sourceDisplayName";

describe("resolveSourceDisplayName", () => {
  it("applies kstream aliases", () => {
    expect(resolveSourceDisplayName("peestream", "PeeStream")).toBe("kdesa");
    expect(resolveSourceDisplayName("way2movies", "Way2Movies")).toBe("brandon");
    expect(resolveSourceDisplayName("cornclick", "CornClick")).toBe("brian");
    expect(resolveSourceDisplayName("tqq", "TQQ (Anime)")).toBe("TQQ");
  });

  it("falls back to provider name then id", () => {
    expect(resolveSourceDisplayName("nova", "Nova")).toBe("Nova");
    expect(resolveSourceDisplayName("nova")).toBe("nova");
  });
});
