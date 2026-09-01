export const MAX_PLAYBACK_AUTO_RETRIES = 3;

export interface PlaybackRetryBudget {
  setMedia(mediaKey: string): void;
  recordAttempt(): void;
  isExhausted(maxAttempts: number): boolean;
  getAttemptCount(): number;
}

/**
 * Tracks automatic playback recovery attempts for one title.
 *
 * Scraping a replacement stream is not proof that playback recovered, so the
 * budget is reset only when the media route changes.
 */
export function createPlaybackRetryBudget(): PlaybackRetryBudget {
  let activeMediaKey: string | null = null;
  let attemptCount = 0;

  return {
    setMedia(mediaKey) {
      if (mediaKey === activeMediaKey) return;
      activeMediaKey = mediaKey;
      attemptCount = 0;
    },
    recordAttempt() {
      attemptCount += 1;
    },
    isExhausted(maxAttempts) {
      return maxAttempts <= 0 || attemptCount >= maxAttempts;
    },
    getAttemptCount() {
      return attemptCount;
    },
  };
}
