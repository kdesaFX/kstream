import { describe, expect, it } from "vitest";

import { resolveAudioLanguage } from "./inferAudioLanguage";
import { resolutionHeightToQuality } from "@/stores/player/utils/qualities";

describe("resolveAudioLanguage", () => {
  it("keeps explicit lang tags", () => {
    expect(resolveAudioLanguage("en", "Track 1")).toBe("en");
  });

  it("infers from common labels when lang is missing", () => {
    expect(resolveAudioLanguage(null, "English")).toBe("en");
    expect(resolveAudioLanguage("unknown", "Audio - Spanish")).toBe("es");
    expect(resolveAudioLanguage(undefined, "FRA")).toBe("fr");
    expect(resolveAudioLanguage("", "pt-BR Dual")).toBe("pt");
  });

  it("returns unknown when nothing matches", () => {
    expect(resolveAudioLanguage(null, "Track 1")).toBe("unknown");
    expect(resolveAudioLanguage(null, null)).toBe("unknown");
  });
});

describe("resolutionHeightToQuality", () => {
  it("maps standard heights", () => {
    expect(resolutionHeightToQuality(2160)).toBe("4k");
    expect(resolutionHeightToQuality(1080)).toBe("1080");
    expect(resolutionHeightToQuality(720)).toBe("720");
    expect(resolutionHeightToQuality(480)).toBe("480");
    expect(resolutionHeightToQuality(360)).toBe("360");
  });

  it("returns null for empty height", () => {
    expect(resolutionHeightToQuality(0)).toBeNull();
  });
});
