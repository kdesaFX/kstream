export interface LowPerformanceSnapshot {
  enableThumbnails: boolean;
  enableAutoplay: boolean;
  enableDiscover: boolean;
  enableFeatured: boolean;
  enableDetailsModal: boolean;
  enableImageLogos: boolean;
  enablePauseOverlay: boolean;
  forceCompactEpisodeView: boolean;
}

/** Used when performance mode was on before we started snapshotting. */
export const LOW_PERFORMANCE_RESTORE_DEFAULTS: LowPerformanceSnapshot = {
  enableThumbnails: true,
  enableAutoplay: true,
  enableDiscover: true,
  enableFeatured: true,
  enableDetailsModal: true,
  enableImageLogos: true,
  enablePauseOverlay: true,
  forceCompactEpisodeView: false,
};

export function captureLowPerformanceSnapshot(
  s: LowPerformanceSnapshot,
): LowPerformanceSnapshot {
  return {
    enableThumbnails: s.enableThumbnails,
    enableAutoplay: s.enableAutoplay,
    enableDiscover: s.enableDiscover,
    enableFeatured: s.enableFeatured,
    enableDetailsModal: s.enableDetailsModal,
    enableImageLogos: s.enableImageLogos,
    enablePauseOverlay: s.enablePauseOverlay,
    forceCompactEpisodeView: s.forceCompactEpisodeView,
  };
}

export function applyLowPerformanceRestrictions(
  s: LowPerformanceSnapshot,
): void {
  s.enableThumbnails = false;
  s.enableAutoplay = false;
  s.enableDiscover = false;
  s.enableFeatured = false;
  s.enableDetailsModal = false;
  s.enableImageLogos = false;
  s.enablePauseOverlay = false;
  s.forceCompactEpisodeView = true;
}

export function restoreLowPerformanceSnapshot(
  s: LowPerformanceSnapshot,
  snapshot: LowPerformanceSnapshot | null | undefined,
): void {
  const snap = snapshot ?? LOW_PERFORMANCE_RESTORE_DEFAULTS;
  s.enableThumbnails = snap.enableThumbnails;
  s.enableAutoplay = snap.enableAutoplay;
  s.enableDiscover = snap.enableDiscover;
  s.enableFeatured = snap.enableFeatured;
  s.enableDetailsModal = snap.enableDetailsModal;
  s.enableImageLogos = snap.enableImageLogos;
  s.enablePauseOverlay = snap.enablePauseOverlay;
  s.forceCompactEpisodeView = snap.forceCompactEpisodeView;
}
