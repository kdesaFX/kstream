export type DeviceProfile = "low" | "mid" | "high";
export type PosterQuality = "low" | "standard";

export interface DeviceProfileFlags {
  enableThumbnails: boolean;
  enableAutoplay: boolean;
  enableDiscover: boolean;
  enableFeatured: boolean;
  enableDetailsModal: boolean;
  enableImageLogos: boolean;
  enablePauseOverlay: boolean;
  forceCompactEpisodeView: boolean;
  enableCarouselView: boolean;
  enableLowPerformanceMode: boolean;
  proxyTmdb: boolean;
  proxyArtwork: boolean;
  posterQuality: PosterQuality;
}

export interface DeviceProfileSnapshot extends DeviceProfileFlags {}

/** Full experience — High build, and Reset when we have no snapshot. */
export const HIGH_DEVICE_PROFILE: DeviceProfileFlags = {
  enableThumbnails: false,
  enableAutoplay: true,
  enableDiscover: true,
  enableFeatured: true,
  enableDetailsModal: true,
  enableImageLogos: true,
  enablePauseOverlay: false,
  forceCompactEpisodeView: false,
  enableCarouselView: false,
  enableLowPerformanceMode: false,
  proxyTmdb: false,
  proxyArtwork: false,
  posterQuality: "standard",
};

export const MID_DEVICE_PROFILE: DeviceProfileFlags = {
  enableThumbnails: false,
  enableAutoplay: false,
  enableDiscover: true,
  enableFeatured: false,
  enableDetailsModal: true,
  enableImageLogos: true,
  enablePauseOverlay: false,
  forceCompactEpisodeView: false,
  enableCarouselView: false,
  enableLowPerformanceMode: true,
  proxyTmdb: true,
  proxyArtwork: true,
  posterQuality: "standard",
};

/** School Chromebooks — Discover off is the main win. */
export const LOW_DEVICE_PROFILE: DeviceProfileFlags = {
  enableThumbnails: false,
  enableAutoplay: false,
  enableDiscover: false,
  enableFeatured: false,
  enableDetailsModal: false,
  enableImageLogos: false,
  enablePauseOverlay: false,
  forceCompactEpisodeView: true,
  enableCarouselView: false,
  enableLowPerformanceMode: true,
  proxyTmdb: true,
  proxyArtwork: true,
  posterQuality: "low",
};

/** How many Discover carousels Mid / low-perf loads before “Show more”. */
export const MID_DISCOVER_CAROUSEL_CAP = 4;

const PRESETS: Record<DeviceProfile, DeviceProfileFlags> = {
  low: LOW_DEVICE_PROFILE,
  mid: MID_DEVICE_PROFILE,
  high: HIGH_DEVICE_PROFILE,
};

export function captureDeviceProfileSnapshot(
  s: DeviceProfileFlags,
): DeviceProfileSnapshot {
  return {
    enableThumbnails: s.enableThumbnails,
    enableAutoplay: s.enableAutoplay,
    enableDiscover: s.enableDiscover,
    enableFeatured: s.enableFeatured,
    enableDetailsModal: s.enableDetailsModal,
    enableImageLogos: s.enableImageLogos,
    enablePauseOverlay: s.enablePauseOverlay,
    forceCompactEpisodeView: s.forceCompactEpisodeView,
    enableCarouselView: s.enableCarouselView,
    enableLowPerformanceMode: s.enableLowPerformanceMode,
    proxyTmdb: s.proxyTmdb,
    proxyArtwork: s.proxyArtwork,
    posterQuality: s.posterQuality ?? "standard",
  };
}

export function applyDeviceProfileFlags(
  s: DeviceProfileFlags,
  flags: DeviceProfileFlags,
): void {
  s.enableThumbnails = flags.enableThumbnails;
  s.enableAutoplay = flags.enableAutoplay;
  s.enableDiscover = flags.enableDiscover;
  s.enableFeatured = flags.enableFeatured;
  s.enableDetailsModal = flags.enableDetailsModal;
  s.enableImageLogos = flags.enableImageLogos;
  s.enablePauseOverlay = flags.enablePauseOverlay;
  s.forceCompactEpisodeView = flags.forceCompactEpisodeView;
  s.enableCarouselView = flags.enableCarouselView;
  s.enableLowPerformanceMode = flags.enableLowPerformanceMode;
  s.proxyTmdb = flags.proxyTmdb;
  s.proxyArtwork = flags.proxyArtwork;
  s.posterQuality = flags.posterQuality;
}

/** Account-settings fields owned by a device profile (pushed on apply/reset). */
export function deviceProfileToSettingsPatch(
  s: DeviceProfileFlags,
): {
  enableThumbnails: boolean;
  enableAutoplay: boolean;
  enableDiscover: boolean;
  enableFeatured: boolean;
  enableDetailsModal: boolean;
  enableImageLogos: boolean;
  enablePauseOverlay: boolean;
  forceCompactEpisodeView: boolean;
  enableCarouselView: boolean;
  enableLowPerformanceMode: boolean;
  proxyTmdb: boolean;
  proxyArtwork: boolean;
  posterQuality: PosterQuality;
} {
  return {
    enableThumbnails: s.enableThumbnails,
    enableAutoplay: s.enableAutoplay,
    enableDiscover: s.enableDiscover,
    enableFeatured: s.enableFeatured,
    enableDetailsModal: s.enableDetailsModal,
    enableImageLogos: s.enableImageLogos,
    enablePauseOverlay: s.enablePauseOverlay,
    forceCompactEpisodeView: s.forceCompactEpisodeView,
    enableCarouselView: s.enableCarouselView,
    enableLowPerformanceMode: s.enableLowPerformanceMode,
    proxyTmdb: s.proxyTmdb,
    proxyArtwork: s.proxyArtwork,
    posterQuality: s.posterQuality ?? "standard",
  };
}

export function flagsForDeviceProfile(profile: DeviceProfile): DeviceProfileFlags {
  return { ...PRESETS[profile] };
}

export function deviceProfilesMatch(
  a: DeviceProfileFlags,
  b: DeviceProfileFlags,
): boolean {
  return (
    a.enableThumbnails === b.enableThumbnails &&
    a.enableAutoplay === b.enableAutoplay &&
    a.enableDiscover === b.enableDiscover &&
    a.enableFeatured === b.enableFeatured &&
    a.enableDetailsModal === b.enableDetailsModal &&
    a.enableImageLogos === b.enableImageLogos &&
    a.enablePauseOverlay === b.enablePauseOverlay &&
    a.forceCompactEpisodeView === b.forceCompactEpisodeView &&
    a.enableCarouselView === b.enableCarouselView &&
    a.enableLowPerformanceMode === b.enableLowPerformanceMode &&
    a.proxyTmdb === b.proxyTmdb &&
    a.proxyArtwork === b.proxyArtwork &&
    (a.posterQuality ?? "standard") === (b.posterQuality ?? "standard")
  );
}

export function inferDeviceProfile(
  s: DeviceProfileFlags,
): DeviceProfile | "custom" {
  if (deviceProfilesMatch(s, LOW_DEVICE_PROFILE)) return "low";
  if (deviceProfilesMatch(s, MID_DEVICE_PROFILE)) return "mid";
  if (deviceProfilesMatch(s, HIGH_DEVICE_PROFILE)) return "high";
  return "custom";
}

export function lazyRootMarginFor(posterQuality: PosterQuality, lowPerf: boolean): string {
  if (posterQuality === "low") return "80px";
  if (lowPerf) return "200px";
  return "400px";
}

/** Browser-side guess for which Optimize card to recommend. */
export function recommendDeviceProfile(
  nav: {
    hardwareConcurrency?: number;
    deviceMemory?: number;
    connection?: { effectiveType?: string } | null;
  } = typeof navigator !== "undefined" ? navigator : {},
): DeviceProfile {
  const cores = nav.hardwareConcurrency ?? 4;
  const mem =
    typeof nav.deviceMemory === "number" && nav.deviceMemory > 0
      ? nav.deviceMemory
      : undefined;
  const effectiveType = nav.connection?.effectiveType ?? "";

  if (
    cores <= 2 ||
    (mem !== undefined && mem <= 2) ||
    effectiveType === "slow-2g" ||
    effectiveType === "2g"
  ) {
    return "low";
  }

  if (
    cores <= 4 ||
    (mem !== undefined && mem <= 4) ||
    effectiveType === "3g"
  ) {
    return "mid";
  }

  if (mem !== undefined && mem < 8) return "mid";
  if (cores < 8 && mem === undefined) return "mid";

  return "high";
}

/** Short bullets for the Optimize “done” screen (i18n keys under settings.optimize). */
export function deviceProfileSummaryKeys(
  profile: DeviceProfile,
): string[] {
  if (profile === "low") {
    return [
      "settings.optimize.summaryDiscoverOff",
      "settings.optimize.summarySmallPosters",
      "settings.optimize.summaryFewerAnimations",
      "settings.optimize.summaryProxyArtwork",
    ];
  }
  if (profile === "mid") {
    return [
      "settings.optimize.summaryDiscoverLimited",
      "settings.optimize.summaryFewerAnimations",
      "settings.optimize.summaryProxyArtwork",
    ];
  }
  return [
    "settings.optimize.summaryDiscoverOn",
    "settings.optimize.summaryFeaturedOn",
    "settings.optimize.summaryFullQuality",
  ];
}

export const DEVICE_PROFILE_APPLY_STEPS: Record<
  DeviceProfile,
  Array<"posters" | "proxy" | "effects" | "lazy" | "restorePosters" | "restoreEffects" | "save">
> = {
  low: ["posters", "proxy", "effects", "lazy", "save"],
  mid: ["proxy", "effects", "lazy", "save"],
  high: ["restorePosters", "restoreEffects", "save"],
};
