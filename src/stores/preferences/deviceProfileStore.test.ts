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

  it("does not stomp image logos when toggling performance mode", () => {
    const { applyDeviceProfile, setEnableLowPerformanceMode } =
      usePreferencesStore.getState();
    applyDeviceProfile("high");
    setEnableLowPerformanceMode(true);
    expect(usePreferencesStore.getState().enableImageLogos).toBe(true);
    setEnableLowPerformanceMode(false);
    expect(usePreferencesStore.getState().enableImageLogos).toBe(true);
  });
});
