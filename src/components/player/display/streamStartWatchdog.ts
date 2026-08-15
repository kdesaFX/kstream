/**
 * A source can scrape fine, hand back a manifest, and then never deliver
 * media. hls.js retries such a stream indefinitely, so nothing reports an
 * error and the player spins forever. This decides when to call it dead.
 */
export interface StreamStartCheck {
  /** HTMLMediaElement.readyState */
  readyState: number;
  paused: boolean;
  /** True while the player still intends to start playback on its own. */
  autoplayPending: boolean;
  /** Milliseconds left before the stream is considered dead. */
  msRemaining: number;
}

export type StreamStartVerdict =
  /** Enough buffered to play — stop watching. */
  | "alive"
  /** Deliberately parked (play button showing) — stop watching. */
  | "not-starting"
  /** Still inside the grace period. */
  | "waiting"
  /** Never buffered in time — treat as a playback error. */
  | "timeout";

/** HAVE_FUTURE_DATA: the element can play from its current position. */
const READY_TO_PLAY = 3;

export function streamStartVerdict(
  check: StreamStartCheck,
): StreamStartVerdict {
  if (check.readyState >= READY_TO_PLAY) return "alive";
  if (!check.autoplayPending && check.paused) return "not-starting";
  if (check.msRemaining > 0) return "waiting";
  return "timeout";
}
