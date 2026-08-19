/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import {
  HIGH_DEVICE_PROFILE,
  LOW_DEVICE_PROFILE,
  MID_DEVICE_PROFILE,
  applyDeviceProfileFlags,
  captureDeviceProfileSnapshot,
  deviceProfilesMatch,
  inferDeviceProfile,
  type DeviceProfileFlags,
} from "@/stores/preferences/deviceProfile";

function sample(overrides: Partial<DeviceProfileFlags> = {}): DeviceProfileFlags {
  return { ...HIGH_DEVICE_PROFILE, ...overrides };
}

describe("device profiles", () => {
  it("keeps discover on for low end", () => {
    expect(LOW_DEVICE_PROFILE.enableDiscover).toBe(true);
    expect(LOW_DEVICE_PROFILE.posterQuality).toBe("low");
    expect(LOW_DEVICE_PROFILE.proxyArtwork).toBe(true);
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
    applyDeviceProfileFlags(before, snap);
    expect(deviceProfilesMatch(before, snap)).toBe(true);
    expect(before.enableFeatured).toBe(true);
  });

  it("marks unknown mixes as custom", () => {
    const s = sample({ enableThumbnails: true, proxyArtwork: true });
    expect(inferDeviceProfile(s)).toBe("custom");
  });
});
