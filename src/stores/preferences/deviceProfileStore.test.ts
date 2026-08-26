/* eslint-disable import/no-extraneous-dependencies */
import { afterEach, describe, expect, it } from "vitest";

import { HIGH_DEVICE_PROFILE } from "@/stores/preferences/deviceProfile";
import { usePreferencesStore } from "@/stores/preferences";

function restoreHighDefaults() {
  usePreferencesStore.setState({
    ...HIGH_DEVICE_PROFILE,
    lastAppliedDeviceProfile: null,
    deviceProfileSnapshot: null,
    lowPerformanceSnapshot: null,
  });
}

describe("device profile store", () => {
  afterEach(() => {
    restoreHighDefaults();
  });

  it("restores image logos when switching low → high", () => {
    const { applyDeviceProfile } = usePreferencesStore.getState();
    applyDeviceProfile("low");
    expect(usePreferencesStore.getState().enableImageLogos).toBe(false);
    expect(usePreferencesStore.getState().enableLowPerformanceMode).toBe(true);

    applyDeviceProfile("high");
    const after = usePreferencesStore.getState();
    expect(after.enableImageLogos).toBe(true);
    expect(after.enableLowPerformanceMode).toBe(false);
    expect(after.lastAppliedDeviceProfile).toBe("high");
  });

  it("restores image logos on reset after low", () => {
    const { applyDeviceProfile, resetDeviceProfile } =
      usePreferencesStore.getState();
    applyDeviceProfile("low");
    resetDeviceProfile();
    expect(usePreferencesStore.getState().enableImageLogos).toBe(true);
    expect(usePreferencesStore.getState().lastAppliedDeviceProfile).toBeNull();
  });

  it("restores discover after clearAccountBoundState (logout)", () => {
    const { applyDeviceProfile, clearAccountBoundState } =
      usePreferencesStore.getState();
    applyDeviceProfile("low");
    expect(usePreferencesStore.getState().enableDiscover).toBe(false);
    expect(usePreferencesStore.getState().enableLowPerformanceMode).toBe(true);

    clearAccountBoundState();
    const after = usePreferencesStore.getState();
    expect(after.enableDiscover).toBe(true);
    expect(after.enableLowPerformanceMode).toBe(false);
    expect(after.posterQuality).toBe("standard");
    expect(after.proxyArtwork).toBe(false);
    expect(after.lastAppliedDeviceProfile).toBe("high");
    expect(after.deviceProfileSnapshot).toBeNull();
  });
});
