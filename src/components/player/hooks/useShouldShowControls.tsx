import { PlayerHoverState } from "@/stores/player/slices/interface";
import { playerStatus } from "@/stores/player/slices/source";
import { usePlayerStore } from "@/stores/player/store";

export function useShouldShowControls() {
  const hovering = usePlayerStore((s) => s.interface.hovering);
  const lastHoveringState = usePlayerStore(
    (s) => s.interface.lastHoveringState,
  );
  const isPaused = usePlayerStore((s) => s.mediaPlaying.isPaused);
  const isLoading = usePlayerStore((s) => s.mediaPlaying.isLoading);
  const hasPlayedOnce = usePlayerStore((s) => s.mediaPlaying.hasPlayedOnce);
  const hasOpenOverlay = usePlayerStore((s) => s.interface.hasOpenOverlay);
  const isHoveringControls = usePlayerStore(
    (s) => s.interface.isHoveringControls,
  );
  const status = usePlayerStore((s) => s.status);

  const isUsingTouch = lastHoveringState === PlayerHoverState.MOBILE_TAPPED;
  const isHovering = hovering !== PlayerHoverState.NOT_HOVERING;

  // Keep chrome visible while scraping / buffering first frame so Back to home
  // never hides mid-click under the video hit target.
  const awaitingFirstFrame = isLoading && !hasPlayedOnce;
  const forceChromeVisible =
    awaitingFirstFrame || status !== playerStatus.PLAYING;

  const showTargetsWithoutPause =
    forceChromeVisible ||
    isHovering ||
    (isHoveringControls && !isUsingTouch) ||
    hasOpenOverlay;
  const showTargetsIncludingPause =
    showTargetsWithoutPause || isPaused || forceChromeVisible;
  const showTargets = isUsingTouch
    ? showTargetsWithoutPause
    : showTargetsIncludingPause;

  return {
    showTouchTargets: isUsingTouch && showTargets,
    showTargets,
  };
}
