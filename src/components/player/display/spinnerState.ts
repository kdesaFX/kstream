/** HAVE_FUTURE_DATA: the element has enough decoded data to keep going. */
const READY_TO_PLAY = 3;

export interface PlaybackRunningCheck {
  paused: boolean;
  /** True while the element is still resolving a seek. */
  seeking: boolean;
  readyState: number;
  /** Seconds of media time gained since the previous check. */
  advancedBy: number;
}

/**
 * Whether frames are demonstrably reaching the screen.
 *
 * A spinner is a claim that the viewer has to wait, so anything that can prove
 * otherwise should take it down — no matter which stall the player thinks it is
 * still in. Seeking back into buffered video is the case that needed this: no
 * bytes are fetched, so the download-progress path that used to clear the
 * spinner never fires and it sat over playing video until the next seek.
 */
export function isPlaybackVisiblyRunning(check: PlaybackRunningCheck): boolean {
  if (check.paused || check.seeking) return false;
  if (check.readyState < READY_TO_PLAY) return false;
  return check.advancedBy > 0;
}
