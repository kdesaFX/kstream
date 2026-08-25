/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import {
  HIGH_DEVICE_PROFILE,
  LOW_DEVICE_PROFILE,
  MID_DEVICE_PROFILE,
  applyDeviceProfileFlags,
  captureDeviceProfileSnapshot,
  deviceProfileToSettingsPatch,
  deviceProfilesMatch,
  inferDeviceProfile,
  recommendDeviceProfile,
  type DeviceProfileFlags,
} from "@/stores/preferences/deviceProfile";

function sample(overrides: Partial<DeviceProfileFlags> = {}): DeviceProfileFlags {
  return { ...HIGH_DEVICE_PROFILE, ...overrides };
}

describe("device profiles", () => {
  it("turns discover off on low end", () => {
    expect(LOW_DEVICE_PROFILE.enableDiscover).toBe(false);
    expect(LOW_DEVICE_PROFILE.enableFeatured).toBe(false);
    expect(LOW_DEVICE_PROFILE.posterQuality).toBe("low");
    expect(LOW_DEVICE_PROFILE.proxyArtwork).toBe(true);
  });

  it("keeps discover on mid and enables featured on high", () => {
    expect(MID_DEVICE_PROFILE.enableDiscover).toBe(true);
    expect(MID_DEVICE_PROFILE.enableFeatured).toBe(false);
    expect(HIGH_DEVICE_PROFILE.enableDiscover).toBe(true);
    expect(HIGH_DEVICE_PROFILE.enableFeatured).toBe(true);
    expect(HIGH_DEVICE_PROFILE.enableDetailsModal).toBe(true);
  });

  it("applies and infers each preset", () => {
    const s = sample();
    applyDeviceProfileFlags(s, LOW_DEVICE_PROFILE);
    expect(inferDeviceProfile(s)).toBe("low");
    applyDeviceProfileFlags(s, MID_DEVICE_PROFILE);
    expect(inferDeviceProfile(s)).toBe("mid");
    applyDeviceProfileFlags(s, HIGH_DEVICE_PROFILE);
    expect(inferDeviceProfile(s)).toBe("high");
  });

  it("restores a snapshot after applying low", () => {
    const before = sample({ enableFeatured: true, enableAutoplay: false });
    const snap = captureDeviceProfileSnapshot(before);
    applyDeviceProfileFlags(before, LOW_DEVICE_PROFILE);
    expect(before.enableImageLogos).toBe(false);
    expect(before.enableDiscover).toBe(false);
    applyDeviceProfileFlags(before, snap);
    expect(deviceProfilesMatch(before, snap)).toBe(true);
    expect(before.enableFeatured).toBe(true);
  });

  it("marks unknown mixes as custom", () => {
    const s = sample({ enableThumbnails: true, proxyArtwork: true });
    expect(inferDeviceProfile(s)).toBe("custom");
  });

  it("turns image logos back on when switching from low to high", () => {
    const s = sample();
    applyDeviceProfileFlags(s, LOW_DEVICE_PROFILE);
    expect(s.enableImageLogos).toBe(false);
    applyDeviceProfileFlags(s, HIGH_DEVICE_PROFILE);
    expect(s.enableImageLogos).toBe(true);
    expect(s.enableLowPerformanceMode).toBe(false);
    expect(inferDeviceProfile(s)).toBe("high");
  });

  it("turns image logos back on when switching from low to mid", () => {
    const s = sample();
    applyDeviceProfileFlags(s, LOW_DEVICE_PROFILE);
    applyDeviceProfileFlags(s, MID_DEVICE_PROFILE);
    expect(s.enableImageLogos).toBe(true);
    expect(s.enableDiscover).toBe(true);
    expect(inferDeviceProfile(s)).toBe("mid");
  });

  it("includes poster and artwork proxy in settings patch", () => {
    const patch = deviceProfileToSettingsPatch(LOW_DEVICE_PROFILE);
    expect(patch.posterQuality).toBe("low");
    expect(patch.proxyArtwork).toBe(true);
    expect(patch.enableDiscover).toBe(false);
  });

  it("recommends low for weak hardware or slow networks", () => {
    expect(
      recommendDeviceProfile({ hardwareConcurrency: 2, deviceMemory: 2 }),
    ).toBe("low");
    expect(
      recommendDeviceProfile({
        hardwareConcurrency: 8,
        connection: { effectiveType: "2g" },
      }),
    ).toBe("low");
  });

  it("recommends mid for everyday laptops", () => {
    expect(
      recommendDeviceProfile({ hardwareConcurrency: 4, deviceMemory: 4 }),
    ).toBe("mid");
    expect(recommendDeviceProfile({ hardwareConcurrency: 4 })).toBe("mid");
  });

  it("recommends high for strong machines", () => {
    expect(
      recommendDeviceProfile({ hardwareConcurrency: 12, deviceMemory: 16 }),
    ).toBe("high");
  });
});
