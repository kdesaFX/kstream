export type QualityClimbInput = {
  /** Seconds of media buffered ahead of the playhead. */
  bufferedAhead: number;
  /** hls.js bandwidth estimate, in bits per second. */
  bandwidthEstimate: number;
  /** Bitrate of the rung we want to climb to, in bits per second. */
  targetBitrate: number;
};

/** Keep this much of the lower rung playing while the higher one loads ahead. */
export const CLIMB_MIN_BUFFER_SECONDS = 4;

/**
 * Headroom over the target bitrate before we climb. Segments arrive in bursts,
 * so matching the bitrate exactly is not enough to stay ahead of the playhead.
 */
export const CLIMB_BANDWIDTH_SAFETY = 1.5;

/**
 * Whether Auto should upgrade to a higher rung yet.
 *
 * A healthy buffer alone is not proof the connection can sustain the upgrade:
 * slow sources build a few seconds at the low rung and then cannot keep up once
 * pushed higher, which strands the viewer on a spinner. Unknown bitrates fall
 * back to the buffer check so well-behaved streams still climb.
 */
export function shouldClimbQuality(input: QualityClimbInput): boolean {
  if (input.bufferedAhead < CLIMB_MIN_BUFFER_SECONDS) return false;

  const { targetBitrate, bandwidthEstimate } = input;
  if (!Number.isFinite(targetBitrate) || targetBitrate <= 0) return true;
  if (!Number.isFinite(bandwidthEstimate) || bandwidthEstimate <= 0) return true;

  return bandwidthEstimate >= targetBitrate * CLIMB_BANDWIDTH_SAFETY;
}
